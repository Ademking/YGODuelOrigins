/**
 * Built-in reaction GIFs, hand-picked from GIPHY. No API key is needed: images load straight from GIPHY's CDN.
 * Chat only accepts ids from this list, so players cannot push arbitrary GIFs to each other.
 */
export const GIF_LIBRARY: Record<string, string[]> = {
  'Yu-Gi-Oh!': ['Sdqd0pLLrCewE', 'P7zGLXGPUhS6s', 'lEvAambCBZzoY', 'ZizAQhW6k3JMWky5YJ', '2JcFEYm1TvQGI', 'YmNySZc4IiQkE', 'K7NHFtsLG4nqU'],
  'GG': ['H4Vwlm4t7wu7gHJ4v1', 'jRHuBqNdkuWFMIX3Pi', 'h8m8NgBx5Gdhwvl9I9', 'ZEILv6a8KBDFq4KhbB', '257M9ZpiGWPRU2AEjj', '3ohzA8OIjawmw4nLhu', 'ZdO4NenDbsQNwUwKDB', 'jMQ9pIL6UjPd9fo2KA'],
  'LOL': ['kC8N6DPOkbqWTxkNTe', 'l0ExayQDzrI2xOb8A', 'ZqlvCTNHpqrio', '3oEjHI8WJv4x6UPDB6', '61FBkpCzVtv9vLETx1', 'gj0QdZ9FgqGhOBNlFS', 'T3Vx6sVAXzuG4', 'CoDp6NnSmItoY'],
  'Wow': ['oYtVHSxngR3lC', 'Sqfu14lSonVN219Zb6', 'RLkcGcTtWc7QyQZqSM', 'TIRlx3Fzi1A7L2d5z7', 'mJFW5AnlPMvkaolNYj', '5VKbvrjxpVJCM', 'aWPGuTlDqq2yc', 'b8RfbQFaOs1rO10ren'],
  'Mind blown': ['75ZaxapnyMp2w', 'l0IypeKl9NJhPFMrK', '2sddCIZRYfiPlNeLZn', '1L5YuA6wpKkNO', 'rmbShHymFugZMltnsg', 'gsNJquWNIJ8mKbipk3', '5aLrlDiJPMPFS', '3XR0chfiSTtAI'],
  'Hype': ['QiEwJvLEcyHIeMYHOs', 'smueXS8Bnrh4iN5AK1', 'FibBZ3bFGGcoXCB1kd', 'qIsEdzl4bJLehuyyz3', '8NvXvlWeH71oa2Smxa', 't3sZxY5zS5B0z5zMIz', '8JZmEBXoCgDleNWFUt'],
  'Victory': ['lnlAifQdenMxW', 'd2Z4rTi11c9LRita', 'yoJC2JaiEMoxIhQhY4', 'xT0GqssRweIhlz209i', 'QBMc0W0aIcFiSAKSFg', 'jm4nsAWdCV4Lm'],
  'Thinking': ['d3mlE7uhX8KFgEmY', 'hv53DaYcXWe3nRbR1A', 'eGxkm7b2hzDfkNvjo7', 'MZQkUm97KTI1gI8sUj', '3oKIPl97G9KsnxS3XG', 'kNpNw0eB1w4qDYA7hS', 'pY8jLmZw0ElqvVeRH4', 'ZBK7b4vHYyb0n70zJq'],
  'Nervous': ['3ohhwF34cGDoFFhRfy', 'bEVKYB487Lqxy', '4QgiErmjZiPESRcKYt', 'l4FAPppyDXcP8NN0A', 'fE1FOjxKiRSZjcsEDK', 'HThocT5vEPT9K', '1FMaabePDEfgk', '6f15PceJUw8WGlj4uu'],
  'Waiting': ['wkPBxvetT2UUqSukUE', 'QhjR3MG9ZFfjB6BtIZ', 'MEF1VadKbQBdmd8LCn', 'GtJLSmozcdBZf0n6vD', 'QPQ3xlJhqR1BXl89RG', 'QBd2kLB5qDmysEXre9', 'tXL4FHPSnVJ0A', 'QZyBvNVaMbIZ9yadec'],
  'Facepalm': ['XD4qHZpkyUFfq', 'tZiLOffTNGoak', '3og0INyCmHlNylks9O', 'o14YPU6vooy0o', '14aUO0Mf7dWDXW', 'e5uyWolyR0y30Wo1ya', 'Ra1bmpxpsppNC', 'eH2uOQEmvcqcqgPoH3'],
  'Clap': ['YRuFixSNWFVcXaxpmX', 'Qp3QPUb2OWWTE1oZ2z', 'lMBcCPM0VYfhh2zCAy', 'wijMRo7UZXSqA', 'fnK0jeA8vIh2QLq3IZ', 'QTAVEex4ANH1pcdg16', 'kBZBlLVlfECvOQAVno', '774uK11mxE3W0cjE8L'],
  'Thumbs up': ['BYoRqTmcgzHcL9TCy1', 'rMEJyjch7L1tlRlCl3', 'CvZuv5m5cKl8c', 'mgqefqwSbToPe', 'TG3y3b2Ws0gRXgSHoP', 'diUKszNTUghVe', 'F56tNEGsltde', 'MeChHLiJhQ6vANKlGn'],
  'Sad': ['lGBecpB2dIMwt6ohfI', '3oEjI80DSa1grNPTDq', '3JdZYEpHtsTXa', 'SrKbU4TRDgN8apkkES', 'lR3pWtb80Hz22UjrYj', '10tIjpzIu8fe0', 'Lz6971fkGSgCMOOncl', 'P53TSsopKicrm'],
  'Angry': ['l1J9u3TZfpmeDLkD6', 'MLhIi4DoxeUjC', '3o9bJX4O9ShW1L32eY', '8HBRAVPws2AYDNa2Gz', 'BT2dqujaEBalMmvfTi', 'TGi1zmIHpDRsrxtoPq', 'vHcCevWbWkzwk'],
  'RIP': ['GJVpbMjfT2Ftm', 'lEIgFA4ibJEJfC8RMX', '3OymWKuyc2y2BumvVa', 'xIxDPskBEHWSRJnw0p', '3oFzmrqh43AvYwn9Cw', 'JoV2BiMWVZ96taSewG', 'cjKY0wWlPzLdC'],
};
export const GIF_IDS = new Set(Object.values(GIF_LIBRARY).flat());
export const gifURL = (id: string, still = false) => `https://media.giphy.com/media/${id}/200w${still ? '_s' : ''}.gif`;

/** A KLIPY media path like `ii/<32 hex>/c3/5c/AbCd1234.gif`, always loaded from static.klipy.com. */
export const KLIPY_PATH = /^ii\/[0-9a-f]{32}\/[0-9a-f]{2}\/[0-9a-f]{2}\/[A-Za-z0-9]{4,40}\.gif$/;
export const klipyURL = (path: string) => `https://static.klipy.com/${path}`;
export const gifMessage = (id: string) => `gif:${id}`;
export const klipyMessage = (path: string) => `klipy:${path}`;
/** Image URL for a GIF chat message, or null when the text is not one. */
export function gifSrc(text: string) {
  if (text.startsWith('gif:') && GIF_IDS.has(text.slice(4))) return gifURL(text.slice(4));
  if (text.startsWith('klipy:') && KLIPY_PATH.test(text.slice(6))) return klipyURL(text.slice(6));
  return null;
}
