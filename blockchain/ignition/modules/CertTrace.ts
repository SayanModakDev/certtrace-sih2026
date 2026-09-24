import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CertTraceModule", (m) => {
  const issuer = m.getParameter("issuer", m.getAccount(0));
  const certTrace = m.contract("CertTrace", [issuer]);

  return { certTrace };
});
