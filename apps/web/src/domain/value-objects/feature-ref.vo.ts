/**
 * A feature's identity: which checkout, which slug.
 *
 * The same pair the API uses in every path, kept as one object so a component never has
 * to carry two loose strings and never gets them the wrong way round.
 */
export interface FeatureRef {
  repositoryId: string;
  slug: string;
}

export const featureRef = (repositoryId: string, slug: string): FeatureRef => ({ repositoryId, slug });

export const featureKey = (ref: FeatureRef): string => `${ref.repositoryId}/${ref.slug}`;

export const parseFeatureKey = (key: string): FeatureRef | null => {
  const separator = key.indexOf('/');
  if (separator <= 0 || separator === key.length - 1) return null;
  return { repositoryId: key.slice(0, separator), slug: key.slice(separator + 1) };
};

export const featurePath = (ref: FeatureRef): string =>
  `/features/${encodeURIComponent(ref.repositoryId)}/${encodeURIComponent(ref.slug)}`;
