import base from "@dostavka/config/eslint";

// NestJS DI `emitDecoratorMetadata` ishlashi uchun konstruktor turlari ish vaqtida import qilinishi shart,
// shuning uchun `consistent-type-imports` bu paketda o'chirilgan.
export default [...base, { rules: { "@typescript-eslint/consistent-type-imports": "off" } }];
