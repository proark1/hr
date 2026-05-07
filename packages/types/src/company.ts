import { z } from "zod";

export const CompanyProfile = z.object({
  orgId: z.string().uuid(),
  legalName: z.string().nullable(),
  displayName: z.string().nullable(),
  taxId: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  supportEmail: z.string().nullable(),
  logoUrl: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CompanyProfile = z.infer<typeof CompanyProfile>;

export const CompanyProfileUpdate = z.object({
  legalName: z.string().max(300).nullable().optional(),
  displayName: z.string().max(300).nullable().optional(),
  taxId: z.string().max(100).nullable().optional(),
  websiteUrl: z.string().url().nullable().optional(),
  supportEmail: z.string().email().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  addressLine1: z.string().max(300).nullable().optional(),
  addressLine2: z.string().max(300).nullable().optional(),
  city: z.string().max(200).nullable().optional(),
  region: z.string().max(200).nullable().optional(),
  postalCode: z.string().max(40).nullable().optional(),
  country: z.string().length(2).nullable().optional(),
});
export type CompanyProfileUpdate = z.infer<typeof CompanyProfileUpdate>;
