"use client";

const SOCIALS = [
  { platform: 'twitch', url: 'https://www.twitch.tv/juanitofnbr_' },
  { platform: 'twitter', url: 'https://twitter.com/juanitofnbr' },
  { platform: 'instagram', url: 'https://www.instagram.com/juanitofnbr' },
  { platform: 'tiktok', url: 'https://www.tiktok.com/@juanitofnbr' },
  { platform: 'youtube', url: 'https://www.youtube.com/@juanitofnbr' },
  { platform: 'discord', url: 'https://discord.com/users/juanitofnbr' },
];

const SOCIAL_PLATFORMS: Record<string, { src: string; alt: string }> = {
  twitch: { src: '/icons/twitch.png', alt: 'Twitch' },
  twitter: { src: '/icons/twitter.svg', alt: 'Twitter' },
  instagram: { src: '/icons/instagram.png', alt: 'Instagram' },
  tiktok: { src: '/icons/tiktok.png', alt: 'TikTok' },
  youtube: { src: '/icons/youtube.png', alt: 'YouTube' },
  discord: { src: '/icons/discord.png', alt: 'Discord' },
};

export default function LoginSocialCarousel() {
  return (
    <div className="login-social-row">
      {SOCIALS.map(({ platform, url }, index) => {
        const meta = SOCIAL_PLATFORMS[platform];
        return (
          <a
            key={`${platform}-${index}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="social-icon inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900/70 transition hover:bg-zinc-800 hover:opacity-90"
          >
            <img
              src={meta.src}
              alt={meta.alt}
              className="h-6 w-6 object-contain filter grayscale"
            />
          </a>
        );
      })}
    </div>
  );
}
