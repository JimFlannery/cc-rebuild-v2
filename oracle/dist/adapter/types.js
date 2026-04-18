"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDEX_NAME_TO_ANCHOR = void 0;
/**
 * Maps MySQL/oracle IndexName strings to the Anchor enum variant objects
 * used when calling `create_order` on the Solana program.
 *
 * Usage (website / TypeScript client):
 *   program.methods.createOrder(nonce, INDEX_NAME_TO_ANCHOR['Kp'], ...)
 *
 * The on-chain Rust enum is:
 *   Kp | Dst | SolarXRayFlux | SolarProtonFlux | SolarRadioFlux
 *
 * Anchor serialises these as `{ kp: {} }`, `{ dst: {} }`, etc.
 */
exports.INDEX_NAME_TO_ANCHOR = {
    'Kp': { kp: {} },
    'Dst': { dst: {} },
    'Solar X-Ray Flux': { solarXRayFlux: {} },
    'Solar Proton Flux': { solarProtonFlux: {} },
    'Solar Radio Flux': { solarRadioFlux: {} },
};
