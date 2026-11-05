"""Foydalanuvchiga ko'rinadigan matnlar (NFR-18): uz / ru."""
MESSAGES = {
    "unauthorized": {"uz": "Kirish talab qilinadi", "ru": "Требуется вход"},
    "forbidden": {"uz": "Ruxsat yo'q", "ru": "Нет доступа"},
    "not_found": {"uz": "Topilmadi", "ru": "Не найдено"},
    "validation_error": {"uz": "Ma'lumotlar noto'g'ri", "ru": "Некорректные данные"},
    "out_of_zone": {"uz": "Bu manzil xizmat hududidan tashqarida", "ru": "Этот адрес вне зоны обслуживания"},
    "out_of_stock": {"uz": "Mahsulot qoldig'i yetarli emas", "ru": "Недостаточно товара на складе"},
    "slot_full": {"uz": "Tanlangan vaqt oralig'i to'lgan", "ru": "Выбранный интервал занят"},
    "min_order": {"uz": "Minimal buyurtma summasiga yetmadi", "ru": "Не достигнута минимальная сумма заказа"},
    "branch_closed": {"uz": "Filial hozir yopiq", "ru": "Филиал сейчас закрыт"},
    "invalid_transition": {"uz": "Bu holat o'tishi ruxsat etilmagan", "ru": "Этот переход статуса недопустим"},
    "idempotency_key_required": {"uz": "Idempotency-Key sarlavhasi majburiy", "ru": "Нужен заголовок Idempotency-Key"},
    "idempotency_key_reuse": {"uz": "Idempotency-Key boshqa so'rov uchun ishlatilgan", "ru": "Idempotency-Key уже использован для другого запроса"},
    "request_in_progress": {"uz": "So'rov hali bajarilmoqda", "ru": "Запрос ещё выполняется"},
    "otp_invalid": {"uz": "Kod noto'g'ri yoki muddati o'tgan", "ru": "Неверный или просроченный код"},
    "otp_blocked": {"uz": "Urinishlar ko'p. Yangi kod so'rang", "ru": "Слишком много попыток. Запросите новый код"},
    "rate_limited": {"uz": "Juda ko'p so'rov. Keyinroq urinib ko'ring", "ru": "Слишком много запросов. Повторите позже"},
    "bad_credentials": {"uz": "Telefon yoki parol noto'g'ri", "ru": "Неверный телефон или пароль"},
    "mfa_required": {"uz": "MFA kodi kerak", "ru": "Нужен код MFA"},
    "mfa_enrollment_required": {"uz": "Bu rol uchun MFA ni sozlash majburiy", "ru": "Для этой роли обязательна настройка MFA"},
    "tracking_expired": {"uz": "Kuzatuv havolasi muddati tugagan", "ru": "Срок действия ссылки истёк"},
    "approval_pending": {"uz": "Xaridor tasdig'i kutilmoqda", "ru": "Ожидается подтверждение клиента"},
    "pin_invalid": {"uz": "PIN noto'g'ri", "ru": "Неверный PIN"},
    "pin_locked": {"uz": "PIN urinishlari tugadi. Dispetcherga murojaat qiling", "ru": "Попытки PIN исчерпаны. Обратитесь к диспетчеру"},
    "reason_required": {"uz": "Sabab ko'rsatish majburiy", "ru": "Нужно указать причину"},
    "contact_attempts_required": {"uz": "Kamida 2 bog'lanish urinishi va kutish kerak", "ru": "Нужно минимум 2 попытки связи и ожидание"},
    "refund_limit": {"uz": "Qaytarish summasi limitdan oshdi — moliya tasdig'i kerak", "ru": "Сумма возврата выше лимита — нужно подтверждение финансов"},
    "refund_too_large": {"uz": "Qaytarish summasi to'langandan oshib ketdi", "ru": "Сумма возврата превышает оплаченную"},
    "bad_signature": {"uz": "Imzo noto'g'ri", "ru": "Неверная подпись"},
    "cancel_not_allowed": {"uz": "Buyurtmani endi bekor qilib bo'lmaydi", "ru": "Заказ уже нельзя отменить"},
    "stale_pos": {"uz": "POS ma'lumoti eskirgan", "ru": "Данные POS устарели"},
}


def msg(code, lang="uz"):
    d = MESSAGES.get(code)
    if not d:
        return code
    return d.get(lang) or d["uz"]


def lang_of(request):
    h = (request.headers.get("Accept-Language") or "uz").lower()
    return "ru" if h.startswith("ru") else "uz"
