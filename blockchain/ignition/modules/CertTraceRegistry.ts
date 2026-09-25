import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CertTraceRegistryModule", (m) => {
  const certTraceRegistry = m.contract("CertTraceRegistry");

  return { certTraceRegistry };
});
