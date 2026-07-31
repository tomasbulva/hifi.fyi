import { useEffect, useState } from 'react';

interface AlbumBackdropProps {
  coverUrl: string;
}

export function AlbumBackdrop({ coverUrl }: AlbumBackdropProps) {
  const [currentUrl, setCurrentUrl] = useState(coverUrl);
  const [nextUrl, setNextUrl] = useState<string | null>(null);

  useEffect(() => {
    if (coverUrl !== currentUrl) {
      setNextUrl(coverUrl);
    }
  }, [coverUrl, currentUrl]);

  return (
    <div className="album-backdrop" style={{ backgroundImage: `url(${currentUrl})` }}>
      {nextUrl && (
        <img
          src={nextUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-0"
          onLoad={() => {
            setCurrentUrl(nextUrl);
            setNextUrl(null);
          }}
          onError={() => setNextUrl(null)}
        />
      )}
    </div>
  );
}
