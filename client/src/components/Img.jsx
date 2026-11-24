import { useEffect, useState } from 'react';

/** A picture that never shows the browser's "broken image" icon:
    if the file is missing (or there is no src, or it is the server's default picture) it shows `fallback` instead. */
export default function Img({ src, fallback = null, alt = '', ...rest }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  // The server's stand-in picture for a missing file: show our own icon instead
  if (!src || failed || /\/static\/default-item\.png$/.test(src)) return fallback;
  return <img src={src} alt={alt} onError={() => setFailed(true)} {...rest} />;
}
