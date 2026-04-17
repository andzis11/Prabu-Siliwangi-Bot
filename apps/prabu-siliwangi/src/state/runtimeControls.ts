import { AppConfig } from "../domain/types";

export interface RuntimeFeatureFlags {
  walletIntel: boolean;
  meteora: boolean;
  pnl: boolean;
  copytrade: boolean;
}

export interface RuntimeControlSnapshot {
  paperMode: boolean;
  aiSniper: boolean;
  mevSandwich: boolean;
  mevArbitrage: boolean;
  copytradeEnabled: boolean;
  features: RuntimeFeatureFlags;
  updatedAt: string;
}

export interface RuntimeControlsStore {
  getSnapshot(): RuntimeControlSnapshot;
  setPaperMode(enabled: boolean): RuntimeControlSnapshot;
  togglePaperMode(): RuntimeControlSnapshot;
  setCopytradeEnabled(enabled: boolean): RuntimeControlSnapshot;
  toggleCopytradeEnabled(): RuntimeControlSnapshot;
  setAiSniper(enabled: boolean): RuntimeControlSnapshot;
  toggleAiSniper(): RuntimeControlSnapshot;
  setMevSandwich(enabled: boolean): RuntimeControlSnapshot;
  toggleMevSandwich(): RuntimeControlSnapshot;
  setMevArbitrage(enabled: boolean): RuntimeControlSnapshot;
  toggleMevArbitrage(): RuntimeControlSnapshot;
  setFeature(
    feature: keyof RuntimeFeatureFlags,
    enabled: boolean,
  ): RuntimeControlSnapshot;
  toggleFeature(feature: keyof RuntimeFeatureFlags): RuntimeControlSnapshot;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createInitialSnapshot(config: AppConfig): RuntimeControlSnapshot {
  const copytradeEnabled = config.features.copytrade || config.copytrade.enabled;

  return {
    paperMode: false,
    aiSniper: false,
    mevSandwich: false,
    mevArbitrage: false,
    copytradeEnabled,
    features: {
      walletIntel: config.features.walletIntel,
      meteora: config.features.meteora,
      pnl: config.features.pnl,
      copytrade: copytradeEnabled,
    },
    updatedAt: nowIso(),
  };
}

class InMemoryRuntimeControlsStore implements RuntimeControlsStore {
  private snapshot: RuntimeControlSnapshot;

  constructor(config: AppConfig) {
    this.snapshot = createInitialSnapshot(config);
  }

  getSnapshot(): RuntimeControlSnapshot {
    return {
      ...this.snapshot,
      features: { ...this.snapshot.features },
    };
  }

  setPaperMode(enabled: boolean): RuntimeControlSnapshot {
    this.snapshot = {
      ...this.snapshot,
      paperMode: enabled,
      updatedAt: nowIso(),
    };
    return this.getSnapshot();
  }

  togglePaperMode(): RuntimeControlSnapshot {
    return this.setPaperMode(!this.snapshot.paperMode);
  }

  setCopytradeEnabled(enabled: boolean): RuntimeControlSnapshot {
    this.snapshot = {
      ...this.snapshot,
      copytradeEnabled: enabled,
      features: {
        ...this.snapshot.features,
        copytrade: enabled,
      },
      updatedAt: nowIso(),
    };
    return this.getSnapshot();
  }

  toggleCopytradeEnabled(): RuntimeControlSnapshot {
    return this.setCopytradeEnabled(!this.snapshot.copytradeEnabled);
  }

  setAiSniper(enabled: boolean): RuntimeControlSnapshot {
    this.snapshot = {
      ...this.snapshot,
      aiSniper: enabled,
      updatedAt: nowIso(),
    };
    return this.getSnapshot();
  }

  toggleAiSniper(): RuntimeControlSnapshot {
    return this.setAiSniper(!this.snapshot.aiSniper);
  }

  setMevSandwich(enabled: boolean): RuntimeControlSnapshot {
    this.snapshot = {
      ...this.snapshot,
      mevSandwich: enabled,
      updatedAt: nowIso(),
    };
    return this.getSnapshot();
  }

  toggleMevSandwich(): RuntimeControlSnapshot {
    return this.setMevSandwich(!this.snapshot.mevSandwich);
  }

  setMevArbitrage(enabled: boolean): RuntimeControlSnapshot {
    this.snapshot = {
      ...this.snapshot,
      mevArbitrage: enabled,
      updatedAt: nowIso(),
    };
    return this.getSnapshot();
  }

  toggleMevArbitrage(): RuntimeControlSnapshot {
    return this.setMevArbitrage(!this.snapshot.mevArbitrage);
  }

  setFeature(
    feature: keyof RuntimeFeatureFlags,
    enabled: boolean,
  ): RuntimeControlSnapshot {
    const nextFeatures = {
      ...this.snapshot.features,
      [feature]: enabled,
    };

    this.snapshot = {
      ...this.snapshot,
      copytradeEnabled:
        feature === "copytrade" ? enabled : this.snapshot.copytradeEnabled,
      features: nextFeatures,
      updatedAt: nowIso(),
    };

    return this.getSnapshot();
  }

  toggleFeature(feature: keyof RuntimeFeatureFlags): RuntimeControlSnapshot {
    return this.setFeature(feature, !this.snapshot.features[feature]);
  }
}

export function createRuntimeControlsStore(
  config: AppConfig,
): RuntimeControlsStore {
  return new InMemoryRuntimeControlsStore(config);
}
