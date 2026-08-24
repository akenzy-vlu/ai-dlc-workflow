import { ValueObject } from '../../../../shared/kernel';

export interface RepositorySettingsProps {
  /** `profile:` — the stack profile skill, or `none`. */
  profile: string;
  /** `ruleset:` — pinned validation ruleset. A mismatch with uow_graph.py is a warning. */
  ruleset: number | null;
  /** `layers:` — the layer vocabulary every ticket must name one of. */
  layers: string[];
  /** True when `.ai/aidlc.yaml` declares a `verify:` block (ai-dlc-verify is in play). */
  hasVerifyBlock: boolean;
  /** False when `.ai/aidlc.yaml` is absent — the repo is using AI-DLC without config. */
  configured: boolean;
}

/**
 * What a target repo declares in `.ai/aidlc.yaml`.
 *
 * The layer vocabulary is the *only* stack-specific value ai-dlc-core reads, and it lives
 * here rather than in the console because it is a property of the repo, not of the tool.
 * Two repos in this portfolio disagree about it on purpose: a Next.js frontend declares
 * `[config, data, ui, page, test]`, a DDD service `[domain, application, infra, api, test]`.
 */
export class RepositorySettings extends ValueObject<RepositorySettingsProps> {
  private constructor(props: RepositorySettingsProps) {
    super(props);
  }

  static create(props: Partial<RepositorySettingsProps>): RepositorySettings {
    return new RepositorySettings({
      profile: props.profile ?? 'none',
      ruleset: props.ruleset ?? null,
      layers: props.layers ?? [],
      hasVerifyBlock: props.hasVerifyBlock ?? false,
      configured: props.configured ?? false,
    });
  }

  static unconfigured(): RepositorySettings {
    return RepositorySettings.create({});
  }

  get profile(): string {
    return this.props.profile;
  }
  get ruleset(): number | null {
    return this.props.ruleset;
  }
  get layers(): readonly string[] {
    return this.props.layers;
  }
  get hasVerifyBlock(): boolean {
    return this.props.hasVerifyBlock;
  }
  get isConfigured(): boolean {
    return this.props.configured;
  }
  get hasProfile(): boolean {
    return this.props.profile !== 'none' && this.props.profile !== '';
  }
}
