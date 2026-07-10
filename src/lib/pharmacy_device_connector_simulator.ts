import {
  buildPharmacyDeviceIdempotencyKey,
  CURRENT_NSIPS_INTERFACE_VERSION,
  type PharmacyDeviceConnectorKind,
  type PharmacyDeviceOperation,
  type PharmacyDeviceOperationInput,
  type PharmacyDeviceOperationResult,
  type PharmacyDeviceTransferOutcome,
  type ValidatedPharmacyDeviceOperationInput,
  validatePharmacyDeviceOperationInput
} from './pharmacy_device_connector';

export interface PharmacyDeviceConnectorSimulatorEnv {
  NODE_ENV?: string;
  PHARMACY_DEVICE_CONNECTOR_SIMULATOR_ENABLED?: string;
  PHARMACY_DEVICE_CONNECTOR_KIND?: string;
  PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION?: string;
}

export interface PharmacyDeviceConnectorSimulatorOptions {
  now?: () => Date;
  transferIdPrefix?: string;
}

interface PharmacyDeviceSimulatorTransfer {
  transferId: string;
  operation: PharmacyDeviceOperation;
  idempotencyKey: string;
  status: 'active' | 'replaced' | 'cancelled';
  previousTransferId?: string;
  createdAt: string;
  updatedAt: string;
}

interface PharmacyDeviceSimulatorIdempotencyRecord {
  transferId: string;
}

export interface PharmacyDeviceSimulatorConnectorResponse {
  outcome: PharmacyDeviceTransferOutcome | 'rejected';
  transferId?: string;
  receivedAt: string;
  message?: string;
}

const DEFAULT_SIMULATOR_CONNECTOR_KIND: PharmacyDeviceConnectorKind = 'vendor_api';
const DEFAULT_SIMULATOR_INTERFACE_VERSION = 'local-simulator-v1';

function isEnabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function normalizeConnectorKind(value: string | undefined): PharmacyDeviceConnectorKind {
  const kind = String(value || '').trim().toLowerCase();
  return kind === 'nsips_gateway' || kind === 'vendor_api' ? kind : DEFAULT_SIMULATOR_CONNECTOR_KIND;
}

function normalizeInterfaceVersion(env: PharmacyDeviceConnectorSimulatorEnv, connectorKind: PharmacyDeviceConnectorKind): string {
  const version = env.PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION?.trim();
  if (version) return version;
  return connectorKind === 'nsips_gateway' ? CURRENT_NSIPS_INTERFACE_VERSION : DEFAULT_SIMULATOR_INTERFACE_VERSION;
}

export function isPharmacyDeviceConnectorSimulatorEnabled(
  env: PharmacyDeviceConnectorSimulatorEnv = process.env
): boolean {
  return env.NODE_ENV !== 'production' && isEnabled(env.PHARMACY_DEVICE_CONNECTOR_SIMULATOR_ENABLED);
}

export function createPharmacyDeviceConnectorSimulator(options: PharmacyDeviceConnectorSimulatorOptions = {}) {
  const now = options.now || (() => new Date());
  const transferIdPrefix = options.transferIdPrefix || 'sim-transfer';
  const transfersById = new Map<string, PharmacyDeviceSimulatorTransfer>();
  const idempotencyRecords = new Map<string, PharmacyDeviceSimulatorIdempotencyRecord>();
  let sequence = 0;

  function nextTransferId(): string {
    sequence += 1;
    return `${transferIdPrefix}-${String(sequence).padStart(6, '0')}`;
  }

  function timestamp(): string {
    return now().toISOString();
  }

  function rejected(message: string, receivedAt = timestamp()): PharmacyDeviceSimulatorConnectorResponse {
    return {
      outcome: 'rejected',
      receivedAt,
      message
    };
  }

  function duplicate(record: PharmacyDeviceSimulatorIdempotencyRecord): PharmacyDeviceSimulatorConnectorResponse {
    return {
      outcome: 'duplicate',
      transferId: record.transferId,
      receivedAt: timestamp()
    };
  }

  function remember(
    idempotencyKey: string,
    transferId: string
  ) {
    idempotencyRecords.set(idempotencyKey, {
      transferId
    });
  }

  async function handle(
    input: ValidatedPharmacyDeviceOperationInput,
    idempotencyKey: string
  ): Promise<PharmacyDeviceSimulatorConnectorResponse> {
    const existing = idempotencyRecords.get(idempotencyKey);
    if (existing) return duplicate(existing);

    const receivedAt = timestamp();
    if (input.operation === 'submit') {
      const transferId = nextTransferId();
      transfersById.set(transferId, {
        transferId,
        operation: input.operation,
        idempotencyKey,
        status: 'active',
        createdAt: receivedAt,
        updatedAt: receivedAt
      });
      remember(idempotencyKey, transferId);
      return { outcome: 'accepted', transferId, receivedAt };
    }

    const previousTransfer = transfersById.get(input.previousTransferId || '');
    if (!previousTransfer) {
      return rejected('差替または取消対象の連携IDが見つかりません。', receivedAt);
    }
    if (previousTransfer.status === 'cancelled') {
      return rejected('取消済みの連携は差替または取消できません。', receivedAt);
    }

    if (input.operation === 'replace') {
      previousTransfer.status = 'replaced';
      previousTransfer.updatedAt = receivedAt;
      const transferId = nextTransferId();
      transfersById.set(transferId, {
        transferId,
        operation: input.operation,
        idempotencyKey,
        status: 'active',
        previousTransferId: previousTransfer.transferId,
        createdAt: receivedAt,
        updatedAt: receivedAt
      });
      remember(idempotencyKey, transferId);
      return { outcome: 'accepted', transferId, receivedAt };
    }

    previousTransfer.status = 'cancelled';
    previousTransfer.updatedAt = receivedAt;
    remember(idempotencyKey, previousTransfer.transferId);
    return {
      outcome: 'cancelled',
      transferId: previousTransfer.transferId,
      receivedAt
    };
  }

  return {
    handle,
    reset() {
      transfersById.clear();
      idempotencyRecords.clear();
      sequence = 0;
    },
    snapshot() {
      return Array.from(transfersById.values()).map((transfer) => ({ ...transfer }));
    }
  };
}

export type PharmacyDeviceConnectorSimulator = ReturnType<typeof createPharmacyDeviceConnectorSimulator>;

export const localPharmacyDeviceConnectorSimulator = createPharmacyDeviceConnectorSimulator();

function simulatorMessage(outcome: PharmacyDeviceTransferOutcome): string {
  if (outcome === 'duplicate') {
    return 'ローカルシミュレータ: 同じ処方データは送信済みです。';
  }
  if (outcome === 'cancelled') {
    return 'ローカルシミュレータ: 外部調剤機器への連携を取り消しました。';
  }
  return 'ローカルシミュレータ: 外部調剤機器が処方データを受け付けました。';
}

export async function submitPharmacyDeviceSimulatorOperation(
  input: PharmacyDeviceOperationInput,
  options: {
    env?: PharmacyDeviceConnectorSimulatorEnv;
    simulator?: PharmacyDeviceConnectorSimulator;
  } = {}
): Promise<PharmacyDeviceOperationResult> {
  const validated = validatePharmacyDeviceOperationInput(input);
  if (!validated.ok) {
    return { status: 'invalid_request', message: validated.message };
  }

  const env = options.env || process.env;
  const connectorKind = normalizeConnectorKind(env.PHARMACY_DEVICE_CONNECTOR_KIND);
  const interfaceVersion = normalizeInterfaceVersion(env, connectorKind);
  const payloadHash = await buildPharmacyDeviceIdempotencyKey(validated.input);
  const response = await (options.simulator || localPharmacyDeviceConnectorSimulator).handle(
    validated.input,
    payloadHash
  );

  if (response.outcome === 'rejected') {
    return {
      status: 'rejected',
      operation: validated.input.operation,
      message: response.message || 'ローカルシミュレータが処方データを受け付けませんでした。'
    };
  }

  if (!response.transferId) {
    return {
      status: 'error',
      operation: validated.input.operation,
      message: 'ローカルシミュレータの連携IDを確認してください。'
    };
  }

  return {
    status: 'success',
    operation: validated.input.operation,
    message: simulatorMessage(response.outcome),
    outcome: response.outcome,
    transferId: response.transferId,
    payloadHash,
    connectorKind,
    interfaceVersion,
    receivedAt: response.receivedAt
  };
}
