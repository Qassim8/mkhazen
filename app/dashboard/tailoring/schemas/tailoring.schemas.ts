import { z } from "zod";

export const TailoringStatusEnum = z.enum([
  "NEW",
  "UNDER_TAILORING",
  "READY_FOR_PICKUP",
  "RECEIVED",
  "CANCELLED",
  "CONVERTED_TO_PRODUCT",
]);

export type TailoringStatus = z.infer<typeof TailoringStatusEnum>;

export const TailoringPurposeEnum = z.enum(["CUSTOMER", "PRODUCTION"]);
export type TailoringPurpose = z.infer<typeof TailoringPurposeEnum>;

export const MeasurementUnitEnum = z.enum(["CM", "M"]);
export type MeasurementUnit = z.infer<typeof MeasurementUnitEnum>;

export interface MeasurementEntry {
  label: string;
  value: number;
  unit: MeasurementUnit;
}

export const measurementEntrySchema = z.object({
  label: z
    .string({ message: "اسم المقاس مطلوب" })
    .trim()
    .min(1, "اسم المقاس مطلوب")
    .max(50, "اسم المقاس طويل جدًا"),
  value: z
    .number({ message: "قيمة المقاس مطلوبة" })
    .finite("قيمة المقاس غير صالحة")
    .positive("قيمة المقاس يجب أن تكون أكبر من صفر")
    .max(1000, "قيمة المقاس كبيرة جدًا"),
  unit: MeasurementUnitEnum,
});

export const measurementsSchema = z
  .array(measurementEntrySchema)
  .min(1, "يجب إضافة مقاس واحد على الأقل")
  .max(30, "عدد المقاسات كبير جدًا");

export function calculateMeasurementMeters(measurements: MeasurementEntry[]) {
  return Number(
    measurements
      .reduce(
        (total, measurement) =>
          total +
          (measurement.unit === "CM"
            ? measurement.value / 100
            : measurement.value),
        0,
      )
      .toFixed(2),
  );
}

function validateDates(
  data: { intakeDate: string; expectedDeliveryDate: string },
  ctx: z.RefinementCtx,
) {
  if (data.expectedDeliveryDate < data.intakeDate) {
    ctx.addIssue({
      code: "custom",
      message: "تاريخ التسليم لا يمكن أن يسبق تاريخ الاستلام",
      path: ["expectedDeliveryDate"],
    });
  }
}

function validateFabric(
  data: {
    measurements: MeasurementEntry[];
    fabricVariantId: string | null;
    fabricQuantity: number | null;
    tailoringPurpose: TailoringPurpose;
  },
  ctx: z.RefinementCtx,
) {
  const hasFabric = data.fabricVariantId !== null;
  const hasQuantity = data.fabricQuantity !== null;
  const measurementMeters = calculateMeasurementMeters(data.measurements);
  const maxFabricQuantity = Number((measurementMeters + 1).toFixed(2));

  if (data.tailoringPurpose === "PRODUCTION" && !hasFabric) {
    ctx.addIssue({
      code: "custom",
      message: "طلب تصنيع المنتج للمخزون يجب أن يستخدم قماشًا من مخزون المحل",
      path: ["fabricVariantId"],
    });
  }

  if (hasFabric !== hasQuantity) {
    ctx.addIssue({
      code: "custom",
      message: "اختر القماش وحدد كميته، أو اترك القماش من العميل",
      path: [hasFabric ? "fabricQuantity" : "fabricVariantId"],
    });
    return;
  }

  if (!hasFabric || !hasQuantity) return;

  if (data.fabricQuantity! < measurementMeters) {
    ctx.addIssue({
      code: "custom",
      message: `كمية القماش لا تقل عن ${measurementMeters.toFixed(2)} متر حسب المقاسات`,
      path: ["fabricQuantity"],
    });
  }

  if (data.fabricQuantity! > maxFabricQuantity) {
    ctx.addIssue({
      code: "custom",
      message: `كمية القماش لا يمكن أن تتجاوز ${maxFabricQuantity.toFixed(2)} متر`,
      path: ["fabricQuantity"],
    });
  }
}

export const createTailoringOrderSchema = z
  .object({
    tailoringItemName: z
      .string({ message: "اسم العمل/الطلب مطلوب" })
      .trim()
      .min(1, "اسم العمل/الطلب مطلوب")
      .max(255, "اسم العمل/الطلب طويل جدًا"),
    tailoringItemDescription: z
      .string()
      .trim()
      .max(2000, "وصف العمل طويل جدًا")
      .nullable(),
    tailoringPurpose: TailoringPurposeEnum,
    tailorId: z.string().uuid("معرف الخياط غير صالح"),
    customerName: z.string().trim().max(255, "اسم العميل طويل جدًا").nullable(),
    customerWhatsapp: z.string().trim().nullable(),
    customerAdvanceSourceOrderId: z
      .string()
      .uuid("معرف طلب المصدر غير صالح")
      .nullable(),
    measurements: measurementsSchema,
    intakeDate: z
      .string({ message: "تاريخ الاستلام مطلوب" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ الاستلام غير صالح"),
    expectedDeliveryDate: z
      .string({ message: "تاريخ التسليم المتوقع مطلوب" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ التسليم غير صالح"),
    fabricVariantId: z.string().uuid("معرف القماش غير صالح").nullable(),
    fabricQuantity: z
      .number({ message: "كمية القماش غير صالحة" })
      .finite("كمية القماش غير صالحة")
      .positive("كمية القماش يجب أن تكون أكبر من صفر")
      .max(1000, "كمية القماش كبيرة جدًا")
      .nullable(),
    totalAmount: z
      .number({ message: "المبلغ الإجمالي غير صالح" })
      .finite("المبلغ الإجمالي غير صالح")
      .nonnegative("المبلغ الإجمالي غير صالح")
      .nullable(),
    depositAmount: z
      .number({ message: "مبلغ العربون غير صالح" })
      .finite("مبلغ العربون غير صالح")
      .nonnegative("مبلغ العربون غير صالح")
      .nullable(),
    tailoringCost: z
      .number({ message: "تكلفة الخياطة مطلوبة" })
      .finite("تكلفة الخياطة غير صالحة")
      .positive("تكلفة الخياطة يجب أن تكون أكبر من صفر"),
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER"]).nullable(),
    notes: z.string().trim().max(500, "الملاحظات طويلة جدًا").nullable(),
  })
  .superRefine((data, ctx) => {
    validateDates(data, ctx);
    validateFabric(data, ctx);

    if (data.tailoringPurpose === "CUSTOMER") {
      if (!data.customerName?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "اسم العميل مطلوب",
          path: ["customerName"],
        });
      }

      if (!data.customerWhatsapp?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "رقم واتساب العميل مطلوب",
          path: ["customerWhatsapp"],
        });
      } else if (!/^\+?[0-9]{8,15}$/.test(data.customerWhatsapp.trim())) {
        ctx.addIssue({
          code: "custom",
          message: "رقم واتساب غير صالح",
          path: ["customerWhatsapp"],
        });
      }

      if (data.totalAmount == null || data.totalAmount <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "المبلغ الإجمالي يجب أن يكون أكبر من صفر",
          path: ["totalAmount"],
        });
      }

      const expectedDeposit = Number(
        ((data.totalAmount ?? 0) * 0.5).toFixed(2),
      );
      if (
        data.depositAmount == null ||
        Number(data.depositAmount.toFixed(2)) !== expectedDeposit
      ) {
        ctx.addIssue({
          code: "custom",
          message: "العربون يجب أن يساوي 50% من المبلغ الإجمالي",
          path: ["depositAmount"],
        });
      }

      if (data.customerAdvanceSourceOrderId) {
        if (data.paymentMethod !== null) {
          ctx.addIssue({
            code: "custom",
            message: "الطلب البديل لا يستلم دفعة جديدة من العميل",
            path: ["paymentMethod"],
          });
        }
      } else if (!data.paymentMethod) {
        ctx.addIssue({
          code: "custom",
          message: "طريقة دفع العربون مطلوبة",
          path: ["paymentMethod"],
        });
      }
    } else {
      if (data.customerName?.trim() || data.customerWhatsapp?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "التصنيع للمخزون لا يحتوي على بيانات عميل",
          path: ["customerName"],
        });
      }

      if (data.totalAmount != null && data.totalAmount !== 0) {
        ctx.addIssue({
          code: "custom",
          message: "التصنيع للمخزون لا يحتوي على سعر بيع للعميل",
          path: ["totalAmount"],
        });
      }

      if (data.depositAmount != null && data.depositAmount !== 0) {
        ctx.addIssue({
          code: "custom",
          message: "التصنيع للمخزون لا يحتوي على عربون",
          path: ["depositAmount"],
        });
      }

      if (data.paymentMethod) {
        ctx.addIssue({
          code: "custom",
          message: "التصنيع للمخزون لا يحتوي على دفعة من عميل",
          path: ["paymentMethod"],
        });
      }
    }
  });

export type CreateTailoringOrderInput = z.infer<
  typeof createTailoringOrderSchema
>;

export const measurementFormEntrySchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "اسم المقاس مطلوب")
    .max(50, "اسم المقاس طويل جدًا"),
  value: z
    .string()
    .trim()
    .min(1, "قيمة المقاس مطلوبة")
    .refine((value) => Number.isFinite(Number(value)), "قيمة المقاس غير صالحة")
    .refine((value) => Number(value) > 0, "قيمة المقاس يجب أن تكون أكبر من صفر")
    .refine((value) => Number(value) <= 1000, "قيمة المقاس كبيرة جدًا"),
  unit: MeasurementUnitEnum,
});

export const tailoringOrderFormSchema = z
  .object({
    tailoringItemName: z
      .string()
      .trim()
      .min(1, "اسم العمل/الطلب مطلوب")
      .max(255, "اسم العمل/الطلب طويل جدًا"),
    tailoringItemDescription: z
      .string()
      .trim()
      .max(2000, "وصف العمل طويل جدًا"),
    customerAdvanceSourceOrderId: z
      .string()
      .uuid("معرف طلب المصدر غير صالح")
      .nullable(),
    tailoringPurpose: TailoringPurposeEnum,
    tailorId: z.string().min(1, "اختر الخياط المسؤول عن الطلب"),
    customerName: z.string().max(255, "اسم العميل طويل جدًا"),
    customerWhatsapp: z.string(),
    measurements: z
      .array(measurementFormEntrySchema)
      .min(1, "يجب إضافة مقاس واحد على الأقل")
      .max(30, "عدد المقاسات كبير جدًا"),
    intakeDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ الاستلام غير صالح"),
    expectedDeliveryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ التسليم المتوقع غير صالح"),
    useStoreFabric: z.boolean(),
    fabricVariantId: z.string().nullable(),
    fabricQuantity: z.string(),
    totalAmount: z.string(),
    tailoringCost: z
      .string()
      .trim()
      .min(1, "تكلفة الخياطة مطلوبة")
      .refine(
        (value) => Number.isFinite(Number(value)),
        "تكلفة الخياطة غير صالحة",
      )
      .refine(
        (value) => Number(value) > 0,
        "تكلفة الخياطة يجب أن تكون أكبر من صفر",
      ),
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER"]).nullable(),
    notes: z.string().max(500, "الملاحظات طويلة جدًا"),
  })
  .superRefine((data, ctx) => {
    validateDates(data, ctx);

    if (data.tailoringPurpose === "CUSTOMER") {
      if (!data.tailoringItemName.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "اسم العمل/الطلب مطلوب",
          path: ["tailoringItemName"],
        });
      }
      if (!data.customerName.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "اسم العميل مطلوب",
          path: ["customerName"],
        });
      }
      if (!data.customerWhatsapp.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "رقم واتساب العميل مطلوب",
          path: ["customerWhatsapp"],
        });
      } else if (!/^\+?[0-9]{8,15}$/.test(data.customerWhatsapp.trim())) {
        ctx.addIssue({
          code: "custom",
          message: "رقم واتساب غير صالح",
          path: ["customerWhatsapp"],
        });
      }

      const total = Number(data.totalAmount);
      if (!Number.isFinite(total) || total <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "المبلغ الإجمالي يجب أن يكون أكبر من صفر",
          path: ["totalAmount"],
        });
      }
      if (!data.paymentMethod && !data.customerAdvanceSourceOrderId) {
        ctx.addIssue({
          code: "custom",
          message: "طريقة دفع العربون مطلوبة",
          path: ["paymentMethod"],
        });
      }
    } else {
      if (!data.tailoringItemName.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "اسم العمل/المنتج مطلوب",
          path: ["tailoringItemName"],
        });
      }
      if (data.customerAdvanceSourceOrderId) {
        ctx.addIssue({
          code: "custom",
          message: "طلب التصنيع للمخزون لا يمكن أن يستخدم عربون طلب آخر",
          path: ["customerAdvanceSourceOrderId"],
        });
      }
      if (data.customerName.trim() || data.customerWhatsapp.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "التصنيع للمخزون لا يحتوي على بيانات عميل",
          path: ["customerName"],
        });
      }
      if (data.totalAmount.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "التصنيع للمخزون لا يحتوي على سعر بيع للعميل",
          path: ["totalAmount"],
        });
      }
      if (data.paymentMethod) {
        ctx.addIssue({
          code: "custom",
          message: "التصنيع للمخزون لا يحتوي على دفعة للعميل",
          path: ["paymentMethod"],
        });
      }
    }

    const numericMeasurements = data.measurements.map((measurement) => ({
      label: measurement.label,
      value: Number(measurement.value),
      unit: measurement.unit,
    }));
    const measurementMeters = calculateMeasurementMeters(numericMeasurements);
    const max = Number((measurementMeters + 1).toFixed(2));

    if (data.tailoringPurpose === "PRODUCTION" && !data.useStoreFabric) {
      ctx.addIssue({
        code: "custom",
        message: "تصنيع المنتج للمخزون يتطلب استخدام قماش من مخزون المحل",
        path: ["useStoreFabric"],
      });
    }

    if (data.useStoreFabric) {
      if (!data.fabricVariantId) {
        ctx.addIssue({
          code: "custom",
          message: "اختر القماش من مخزون المحل",
          path: ["fabricVariantId"],
        });
      }
      if (!data.fabricQuantity.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "كمية القماش مطلوبة",
          path: ["fabricQuantity"],
        });
      } else {
        const quantity = Number(data.fabricQuantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          ctx.addIssue({
            code: "custom",
            message: "كمية القماش غير صالحة",
            path: ["fabricQuantity"],
          });
        } else {
          if (quantity < measurementMeters) {
            ctx.addIssue({
              code: "custom",
              message: `كمية القماش لا تقل عن ${measurementMeters.toFixed(2)} متر حسب المقاسات`,
              path: ["fabricQuantity"],
            });
          }
          if (quantity > max) {
            ctx.addIssue({
              code: "custom",
              message: `كمية القماش لا يمكن أن تتجاوز ${max.toFixed(2)} متر`,
              path: ["fabricQuantity"],
            });
          }
        }
      }
    } else {
      if (data.fabricVariantId) {
        ctx.addIssue({
          code: "custom",
          message: "أزل اختيار القماش",
          path: ["fabricVariantId"],
        });
      }
      if (data.fabricQuantity.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "كمية القماش يجب أن تكون فارغة",
          path: ["fabricQuantity"],
        });
      }
    }
  });

export type TailoringOrderFormValues = z.infer<typeof tailoringOrderFormSchema>;

export const updateTailoringStatusSchema = z.object({
  status: z.enum(["UNDER_TAILORING", "READY_FOR_PICKUP"], {
    message: "الحالة المطلوبة غير صالحة",
  }),
});

export type UpdateTailoringStatusInput = z.infer<
  typeof updateTailoringStatusSchema
>;

export const updateTailoringOrderFormSchema = z
  .object({
    tailoringPurpose: TailoringPurposeEnum,
    tailoringItemName: z
      .string()
      .trim()
      .min(1, "اسم العمل/الطلب مطلوب")
      .max(255, "اسم العمل/الطلب طويل جدًا"),
    tailoringItemDescription: z
      .string()
      .trim()
      .max(2000, "وصف العمل طويل جدًا"),
    tailorId: z.string().uuid("اختر الخياط المسؤول عن الطلب"),
    customerName: z.string().trim().max(255, "اسم العميل طويل جدًا"),
    customerWhatsapp: z.string().trim(),
    measurements: z
      .array(measurementFormEntrySchema)
      .min(1, "يجب إضافة مقاس واحد على الأقل")
      .max(30, "عدد المقاسات كبير جدًا"),
    intakeDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ الاستلام غير صالح"),
    expectedDeliveryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ التسليم غير صالح"),
    useStoreFabric: z.boolean(),
    fabricVariantId: z.string().nullable(),
    fabricQuantity: z.string(),
    totalAmount: z.string(),
    tailoringCost: z
      .string()
      .trim()
      .min(1, "تكلفة الخياطة مطلوبة")
      .refine(
        (value) => Number.isFinite(Number(value)),
        "تكلفة الخياطة غير صالحة",
      )
      .refine(
        (value) => Number(value) > 0,
        "تكلفة الخياطة يجب أن تكون أكبر من صفر",
      ),
    notes: z.string().max(500, "الملاحظات طويلة جدًا"),
  })
  .superRefine((data, ctx) => {
    if (data.expectedDeliveryDate < data.intakeDate) {
      ctx.addIssue({
        code: "custom",
        message: "تاريخ التسليم لا يمكن أن يسبق تاريخ الاستلام",
        path: ["expectedDeliveryDate"],
      });
    }

    if (!data.tailoringItemName.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "اسم العمل/الطلب مطلوب",
        path: ["tailoringItemName"],
      });
    }

    const numericMeasurements = data.measurements.map((measurement) => ({
      label: measurement.label,
      value: Number(measurement.value),
      unit: measurement.unit,
    }));
    const measurementMeters = calculateMeasurementMeters(numericMeasurements);
    const max = Number((measurementMeters + 1).toFixed(2));

    if (data.tailoringPurpose === "PRODUCTION") {
      if (!data.useStoreFabric) {
        ctx.addIssue({
          code: "custom",
          message: "تصنيع المنتج للمخزون يتطلب استخدام قماش من مخزون المحل",
          path: ["useStoreFabric"],
        });
      }
      if (data.customerName.trim() || data.customerWhatsapp.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "التصنيع للمخزون لا يحتوي على بيانات عميل",
          path: ["customerName"],
        });
      }
      if (data.totalAmount.trim() && Number(data.totalAmount) !== 0) {
        ctx.addIssue({
          code: "custom",
          message: "التصنيع للمخزون لا يحتوي على سعر بيع للعميل",
          path: ["totalAmount"],
        });
      }
    } else {
      if (!data.customerName.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "اسم العميل مطلوب",
          path: ["customerName"],
        });
      }
      if (!data.customerWhatsapp.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "رقم واتساب العميل مطلوب",
          path: ["customerWhatsapp"],
        });
      } else if (!/^\+?[0-9]{8,15}$/.test(data.customerWhatsapp.trim())) {
        ctx.addIssue({
          code: "custom",
          message: "رقم واتساب غير صالح",
          path: ["customerWhatsapp"],
        });
      }
      const total = Number(data.totalAmount);
      if (!Number.isFinite(total) || total <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "المبلغ الإجمالي يجب أن يكون أكبر من صفر",
          path: ["totalAmount"],
        });
      }
    }

    if (data.useStoreFabric) {
      if (!data.fabricVariantId) {
        ctx.addIssue({
          code: "custom",
          message: "اختر القماش من مخزون المحل",
          path: ["fabricVariantId"],
        });
      }
      const quantity = Number(data.fabricQuantity);
      if (
        !data.fabricQuantity.trim() ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        ctx.addIssue({
          code: "custom",
          message: "كمية القماش غير صالحة",
          path: ["fabricQuantity"],
        });
      } else {
        if (quantity < measurementMeters) {
          ctx.addIssue({
            code: "custom",
            message: `كمية القماش لا تقل عن ${measurementMeters.toFixed(2)} متر حسب المقاسات`,
            path: ["fabricQuantity"],
          });
        }
        if (quantity > max) {
          ctx.addIssue({
            code: "custom",
            message: `كمية القماش لا يمكن أن تتجاوز ${max.toFixed(2)} متر`,
            path: ["fabricQuantity"],
          });
        }
      }
    } else {
      if (data.fabricVariantId || data.fabricQuantity.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "أزل القماش أو الكمية لأن القماش من العميل",
          path: ["fabricVariantId"],
        });
      }
    }
  });

export type UpdateTailoringOrderFormValues = z.infer<
  typeof updateTailoringOrderFormSchema
>;

export const updateTailoringOrderApiSchema = z
  .object({
    tailoringItemName: z.string().trim().min(1).max(255),
    tailoringItemDescription: z.string().trim().max(2000).nullable(),
    tailorId: z.string().uuid(),
    customerName: z.string().trim().max(255).nullable(),
    customerWhatsapp: z.string().trim().nullable(),
    measurements: measurementsSchema,
    intakeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expectedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fabricVariantId: z.string().uuid().nullable(),
    fabricQuantity: z.number().finite().positive().nullable(),
    totalAmount: z.number().finite().nonnegative(),
    tailoringCost: z.number().finite().positive(),
    notes: z.string().trim().max(500).nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.expectedDeliveryDate < data.intakeDate) {
      ctx.addIssue({
        code: "custom",
        message: "تاريخ التسليم لا يمكن أن يسبق تاريخ الاستلام",
        path: ["expectedDeliveryDate"],
      });
    }

    if (!data.customerName?.trim()) {
      // Server-side validation decides whether a customer is required after
      // loading the order. Production orders may legitimately send null here.
    }

    if (
      data.customerWhatsapp?.trim() &&
      !/^\+?[0-9]{8,15}$/.test(data.customerWhatsapp.trim())
    ) {
      ctx.addIssue({
        code: "custom",
        message: "رقم واتساب غير صالح",
        path: ["customerWhatsapp"],
      });
    }

    const meters = calculateMeasurementMeters(data.measurements);
    const max = Number((meters + 1).toFixed(2));
    if (data.fabricVariantId === null && data.fabricQuantity !== null) {
      ctx.addIssue({
        code: "custom",
        message: "كمية القماش يجب أن تكون فارغة إذا كان القماش من العميل",
        path: ["fabricQuantity"],
      });
    }
    if (data.fabricVariantId !== null && data.fabricQuantity === null) {
      ctx.addIssue({
        code: "custom",
        message: "كمية القماش مطلوبة",
        path: ["fabricQuantity"],
      });
    }
    if (
      data.fabricQuantity !== null &&
      (data.fabricQuantity < meters || data.fabricQuantity > max)
    ) {
      ctx.addIssue({
        code: "custom",
        message: `كمية القماش يجب أن تكون بين ${meters.toFixed(2)} و ${max.toFixed(2)} متر`,
        path: ["fabricQuantity"],
      });
    }
  });

export type UpdateTailoringOrderApiInput = z.infer<
  typeof updateTailoringOrderApiSchema
>;

export const cancelTailoringOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "سبب الإلغاء مطلوب")
    .max(500, "سبب الإلغاء طويل جدًا"),
});
export type CancelTailoringOrderInput = z.infer<
  typeof cancelTailoringOrderSchema
>;

export const refundCustomerAdvanceSchema = z.object({
  amount: z
    .number({ message: "المبلغ مطلوب" })
    .finite("المبلغ غير صالح")
    .positive("المبلغ يجب أن يكون أكبر من صفر"),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER"], {
    message: "طريقة الاسترداد غير صالحة",
  }),
  notes: z.string().max(500).nullable(),
});
export type RefundCustomerAdvanceInput = z.infer<
  typeof refundCustomerAdvanceSchema
>;

export const completeTailoringPickupSchema = z.object({
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER"], {
    message: "طريقة الدفع غير صالحة",
  }),
});
export type CompleteTailoringPickupInput = z.infer<
  typeof completeTailoringPickupSchema
>;

export const productionCompletionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "اسم المنتج مطلوب")
      .max(255, "اسم المنتج طويل جدًا"),
    description: z.string().trim().max(2000, "الوصف طويل جدًا"),
    categoryId: z.union([z.literal(""), z.string().uuid("التصنيف غير صالح")]),
    producedQuantity: z
      .string()
      .trim()
      .min(1, "كمية الإنتاج مطلوبة")
      .refine(
        (value) => Number.isInteger(Number(value)) && Number(value) > 0,
        "كمية الإنتاج يجب أن تكون عددًا صحيحًا أكبر من صفر",
      ),
    sellingPrice: z
      .string()
      .trim()
      .min(1, "سعر البيع مطلوب")
      .refine(
        (value) => Number.isFinite(Number(value)) && Number(value) > 0,
        "سعر البيع يجب أن يكون أكبر من صفر",
      ),
    minSellingPrice: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          (Number.isFinite(Number(value)) && Number(value) >= 0),
        "الحد الأدنى لسعر البيع غير صالح",
      ),
    sku: z.string().trim().max(100, "SKU طويل جدًا"),
    barcode: z.string().trim().max(100, "الباركود طويل جدًا"),
    packBarcode: z.string().trim().max(100, "باركود العبوة طويل جدًا"),
    colorName: z.string().trim().max(100, "اسم اللون طويل جدًا"),
    colorCode: z.string().trim().max(30, "رمز اللون غير صالح"),
    size: z.string().trim().max(100, "المقاس طويل جدًا"),
    minStockLevel: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          (Number.isFinite(Number(value)) && Number(value) >= 0),
        "الحد الأدنى للمخزون غير صالح",
      ),
  })
  .superRefine((data, ctx) => {
    if (
      data.minSellingPrice.trim() &&
      Number(data.minSellingPrice) > Number(data.sellingPrice)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "الحد الأدنى لسعر البيع لا يمكن أن يتجاوز سعر البيع",
        path: ["minSellingPrice"],
      });
    }
  });

export type ProductionCompletionFormValues = z.infer<
  typeof productionCompletionSchema
>;

/** Form schema output transformed into the numeric API payload. */
export const productionCompletionInputSchema =
  productionCompletionSchema.transform((data) => ({
    name: data.name,
    description: data.description,
    categoryId: data.categoryId || null,
    producedQuantity: Number(data.producedQuantity),
    sellingPrice: Number(data.sellingPrice),
    minSellingPrice: data.minSellingPrice.trim()
      ? Number(data.minSellingPrice)
      : null,
    sku: data.sku.trim() || null,
    barcode: data.barcode.trim() || null,
    packBarcode: data.packBarcode.trim() || null,
    colorName: data.colorName.trim() || null,
    colorCode: data.colorCode.trim() || null,
    size: data.size.trim() || null,
    minStockLevel: data.minStockLevel.trim() ? Number(data.minStockLevel) : 5,
  }));

export type ProductionCompletionInput = z.infer<
  typeof productionCompletionInputSchema
>;

/** API-side schema: receives the already-transformed payload from the browser. */
export const productionCompletionApiSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(2000),
    categoryId: z.string().uuid().nullable(),
    producedQuantity: z.number().finite().int().positive(),
    sellingPrice: z.number().finite().positive(),
    minSellingPrice: z.number().finite().nonnegative().nullable(),
    sku: z.string().trim().max(100).nullable(),
    barcode: z.string().trim().max(100).nullable(),
    packBarcode: z.string().trim().max(100).nullable(),
    colorName: z.string().trim().max(100).nullable(),
    colorCode: z.string().trim().max(30).nullable(),
    size: z.string().trim().max(100).nullable(),
    minStockLevel: z.number().finite().nonnegative(),
  })
  .superRefine((data, ctx) => {
    if (
      data.minSellingPrice !== null &&
      data.minSellingPrice > data.sellingPrice
    ) {
      ctx.addIssue({
        code: "custom",
        message: "الحد الأدنى لسعر البيع لا يمكن أن يتجاوز سعر البيع",
        path: ["minSellingPrice"],
      });
    }
  });

export const payTailorPaymentSchema = z.object({
  tailorId: z.string().uuid("معرف الخياط غير صالح"),
  salesOrderId: z.string().uuid("معرف الطلب غير صالح"),
  amount: z
    .number({ message: "المبلغ مطلوب" })
    .finite("المبلغ غير صالح")
    .positive("المبلغ يجب أن يكون أكبر من صفر"),
  paymentMethod: z.enum(["CASH", "BANK"], { message: "طريقة الدفع غير صالحة" }),
  notes: z.string().max(500, "الملاحظات طويلة جدًا").nullable(),
});
export type PayTailorPaymentInput = z.infer<typeof payTailorPaymentSchema>;

export const payTailorPaymentFormSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, "مبلغ الدفعة مطلوب")
    .refine((value) => Number.isFinite(Number(value)), "مبلغ الدفعة غير صالح")
    .refine(
      (value) => Number(value) > 0,
      "مبلغ الدفعة يجب أن يكون أكبر من صفر",
    ),
  paymentMethod: z.enum(["CASH", "BANK"], { message: "طريقة الدفع غير صالحة" }),
  notes: z.string().max(500, "الملاحظات طويلة جدًا"),
});
export type PayTailorPaymentFormValues = z.infer<
  typeof payTailorPaymentFormSchema
>;

export interface CustomerSummary {
  id: string;
  name: string;
  whatsappNumber: string;
  measurements?: MeasurementEntry[];
}

export interface FabricSummary {
  id: string;
  name: string;
  sku: string | null;
  sellingUnit: string | null;
  stockQuantity: number;
}

export interface TailorSummary {
  id: string;
  name: string;
  phone: string | null;
}

export interface TailorPaymentRecord {
  id: string;
  amount: number;
  paymentType: "ADVANCE" | "SETTLEMENT";
  paymentMethod: "CASH" | "BANK";
  notes: string | null;
  createdAt: string;
  journalEntryId: string | null;
}

export interface ProducedProductSummary {
  templateId: string;
  variantId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  sellingPrice: number;
  averageCost: number;
}

export interface TailoringOrder {
  id: string;
  orderNumber: string;
  tailoringItemName: string;
  tailoringItemDescription: string | null;
  cancellationReason: string | null;
  convertedToProductAt: string | null;
  customerAdvanceAvailable: number;
  customerAdvanceTransferredIn: number;
  customerAdvanceTransferredOut: number;
  customerAdvanceRefunded: number;
  customerAdvanceMovements: {
    direction: "IN" | "OUT" | "REFUND";
    amount: number;
    relatedOrderId: string | null;
    relatedOrderNumber: string | null;
    createdAt: string;
  }[];
  tailoringPurpose: TailoringPurpose;
  cashierId: string | null;
  customerId: string | null;
  customer?: CustomerSummary;
  tailorId: string;
  tailor?: TailorSummary;
  tailorName?: string;
  tailorPhone?: string | null;
  tailoringStatus: TailoringStatus;
  intakeDate: string;
  expectedDeliveryDate: string;
  measurements: MeasurementEntry[];
  measurementMeters: number;
  maxFabricQuantity: number;
  fabricVariantId: string | null;
  fabricQuantity: number | null;
  fabric?: FabricSummary | null;
  fabricCost: number;
  tailoringCost: number;
  totalCost: number;
  grossProfit: number | null;
  tailoringMaterialJournalEntryId: string | null;
  tailoringLaborJournalEntryId: string | null;
  customerAdvanceJournalEntryId: string | null;
  tailoringCogsJournalEntryId: string | null;
  tailoringCostRecognized: boolean;
  tailorPaidAmount: number;
  tailorRemainingAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  paymentMethod: "CASH" | "BANK_TRANSFER" | "MIXED";
  productionTotalCost: number | null;
  producedQuantity: number | null;
  productionMaterialJournalEntryId: string | null;
  productionLaborJournalEntryId: string | null;
  productionInventoryJournalEntryId: string | null;
  producedProduct?: ProducedProductSummary | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  payments?: {
    id: string;
    amount: number;
    paymentDate: string;
    paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER";
    reference: string | null;
    notes: string | null;
    journalEntryId: string | null;
  }[];
  tailorPayments?: TailorPaymentRecord[];
}
