const SPOTIFY_ALBUM_ID = /^[A-Za-z0-9]{22}$/;

export function applyListening(items, listening = {}) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const unknown = Object.keys(listening).filter((id) => !itemsById.has(id));
  if (unknown.length) throw new Error(`Listening data contains unknown item ids: ${unknown.join(", ")}`);

  return items.map((item) => {
    const spotifyId = listening[item.id];
    if (!spotifyId) return item;
    if (item.type !== "album") throw new Error(`Spotify album id assigned to non-album item: ${item.id}`);
    if (!SPOTIFY_ALBUM_ID.test(spotifyId)) throw new Error(`Invalid Spotify album id for ${item.id}`);
    return {
      ...item,
      spotifyId,
      spotifyUrl: `https://open.spotify.com/album/${spotifyId}`,
      spotifyEmbedUrl: `https://open.spotify.com/embed/album/${spotifyId}?utm_source=generator`,
    };
  });
}
