export { createClient, type CallerContext, type ClientConfig, type MyHRClient } from "./client.js";
export { MyHRError, type ApiErrorBody } from "./errors.js";

// Re-export the wire types so consumers don't need to depend on @myhr/types
// directly. They're zod schemas there; here we surface only the inferred TS
// types.
export type {
  Me,
  Org,
  OrgRegion,
  OrgStatus,
  OrgCreate,
  OrgUpdate,
  Membership,
  MembershipRole,
  MyOrg,
  Member,
  Invitation,
  InvitationCreate,
  InvitationCreated,
  InvitationAccept,
  ApiKey,
  ApiKeyScope,
  ApiKeyCreate,
  ApiKeyCreated,
  Employee,
  EmployeeStatus,
  EmployeeCountry,
  EmployeeCreate,
  EmployeeUpdate,
  EmployeeListQuery,
  ErrorResponse,
} from "@myhr/types";
