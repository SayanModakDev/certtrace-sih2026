import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Separate opt-in deployment module for the revocation-capable contract.
 * Running the existing CertTrace module remains unchanged and no V1 records are migrated.
 */
export default buildModule("CertTraceV2Module", (m) => {
  const issuer = m.getParameter("issuer", m.getAccount(0));
  const certTraceV2 = m.contract("CertTraceV2", [issuer]);

  return { certTraceV2 };
});
