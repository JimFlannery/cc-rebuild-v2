import { betterAuth } from "better-auth";
import pool from "./db";

export const auth = betterAuth({
  database: pool, // better-auth auto-detects mysql2 Pool

  emailAndPassword: {
    enabled: true,
  },

  user: {
    additionalFields: {
      // Set to true by a KYC/AML verification webhook once the user passes
      kycVerified: {
        type: "boolean",
        defaultValue: false,
        input: false, // not settable by the user directly
      },
      // Populated when the user connects their Phantom wallet
      walletAddress: {
        type: "string",
        nullable: true,
        defaultValue: null,
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
