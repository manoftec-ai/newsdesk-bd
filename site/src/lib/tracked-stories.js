import trackedRegistry from "../data/tracked-stories.json";

export const trackedStories = () => trackedRegistry.stories ?? [];

export const trackedStoriesBySlug = () =>
  new Map(trackedStories().map((story) => [story.slug, story]));

export const isTracked = (slug) => trackedStoriesBySlug().has(slug);

export const getTrackedStory = (slug) => trackedStoriesBySlug().get(slug);

export const trackedRegistryMeta = () => trackedRegistry.meta ?? {};