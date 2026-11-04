import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Role(models.TextChoices):
    CUSTOMER = "customer"
    TENANT_OWNER = "tenant_owner"
    BRANCH_MANAGER = "branch_manager"
    PICKER = "picker"
    DISPATCHER = "dispatcher"
    COURIER = "courier"
    SUPPORT = "support"
    FINANCE = "finance"
    PLATFORM_ADMIN = "platform_admin"


class UserManager(BaseUserManager):
    def create_user(self, phone, password=None, **extra):
        user = self.model(phone=phone, **extra)
        user.set_password(password) if password else user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        u = self.create_user(phone, password, **extra)
        UserRole.objects.get_or_create(user=u, role=Role.PLATFORM_ADMIN, tenant=None, branch=None)
        return u


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=20, unique=True)          # +998XXXXXXXXX
    full_name = models.CharField(max_length=120, blank=True, default="")
    locale = models.CharField(max_length=5, default="uz")
    mfa_secret = models.CharField(max_length=64, blank=True, default="")
    mfa_confirmed = models.BooleanField(default=False)
    token_epoch = models.IntegerField(default=1)                   # barcha tokenlarni bekor qilish
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = "phone"
    objects = UserManager()

    def __str__(self):
        return self.phone


class UserRole(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="roles")
    role = models.CharField(max_length=20, choices=Role.choices)
    tenant = models.ForeignKey("tenants.Tenant", null=True, blank=True, on_delete=models.CASCADE)
    branch = models.ForeignKey("tenants.Branch", null=True, blank=True, on_delete=models.CASCADE)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "role", "tenant", "branch"],
                                               nulls_distinct=False, name="user_roles_uniq")]


class OTPCode(models.Model):
    phone = models.CharField(max_length=20, db_index=True)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.IntegerField(default=0)
    consumed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class CustomerAddress(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="addresses")
    label = models.CharField(max_length=60, blank=True, default="")
    address_text = models.CharField(max_length=300)
    landmark = models.CharField(max_length=200, blank=True, default="")
    entrance = models.CharField(max_length=20, blank=True, default="")
    floor = models.CharField(max_length=20, blank=True, default="")
    apartment = models.CharField(max_length=20, blank=True, default="")
    lat = models.FloatField()
    lng = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)
