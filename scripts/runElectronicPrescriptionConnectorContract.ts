import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildElectronicPrescriptionConnectorContractCsv,
  buildElectronicPrescriptionConnectorContractReport,
  buildElectronicPrescriptionConnectorContractTemplate,
  type ElectronicPrescriptionConnectorContractInput
} from '../src/lib/electronic_prescription_connector_contract.ts';

const contractPath = process.env.YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT || '';
const outputDir = process.env.YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT_OUTPUT_DIR
  || 'artifacts/electronic-prescription-connector-contract';

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main() {
  const generatedAt = new Date();
  const artifactDir = join(outputDir, stamp(generatedAt));
  await mkdir(artifactDir, { recursive: true });
  const contract = contractPath
    ? await readJsonFile<ElectronicPrescriptionConnectorContractInput>(contractPath)
    : undefined;
  const report = buildElectronicPrescriptionConnectorContractReport({
    generatedAt,
    contract
  });
  const csv = buildElectronicPrescriptionConnectorContractCsv(report);
  const template = buildElectronicPrescriptionConnectorContractTemplate();

  const reportJsonPath = join(artifactDir, 'electronic-prescription-connector-contract.json');
  const reportCsvPath = join(artifactDir, 'electronic-prescription-connector-contract.csv');
  const templatePath = join(artifactDir, 'electronic-prescription-connector-contract-template.json');
  await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(reportCsvPath, `\ufeff${csv}\n`, 'utf8');
  await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: report.status !== 'blocked',
    artifactDir,
    status: report.status,
    statusLabel: report.statusLabel,
    issueCount: report.issueCount,
    coveredScenarioCount: report.coverage.coveredScenarioCount,
    requiredScenarioCount: report.coverage.requiredScenarioCount,
    missingOperations: report.coverage.missingOperations,
    outputs: {
      reportJson: reportJsonPath,
      reportCsv: reportCsvPath,
      template: templatePath
    }
  }, null, 2));

  if (report.status === 'blocked') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
