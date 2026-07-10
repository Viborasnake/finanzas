import type { CSSProperties } from 'react';
import welcome from '../assets/laika/welcome.png';
import pointing from '../assets/laika/pointing.png';
import tip from '../assets/laika/tip.png';
import celebrating from '../assets/laika/celebrating.png';
import thinking from '../assets/laika/thinking.png';
import warning from '../assets/laika/warning.png';
import error from '../assets/laika/error.png';
import success from '../assets/laika/success.png';
import loading from '../assets/laika/loading.png';
import love from '../assets/laika/love.png';

export type LaikaPose =
  | 'welcome'
  | 'pointing'
  | 'tip'
  | 'celebrating'
  | 'thinking'
  | 'warning'
  | 'error'
  | 'success'
  | 'loading'
  | 'love';

const POSES: Record<LaikaPose, string> = {
  welcome,
  pointing,
  tip,
  celebrating,
  thinking,
  warning,
  error,
  success,
  loading,
  love,
};

type LaikaPetProps = {
  pose?: LaikaPose;
  size?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
};

export default function LaikaPet({
  pose = 'welcome',
  size = 112,
  title = 'Laika',
  className,
  style,
}: LaikaPetProps) {
  return (
    <img
      className={className}
      src={POSES[pose]}
      alt={title}
      draggable={false}
      style={{
        width: size,
        height: 'auto',
        display: 'block',
        userSelect: 'none',
        ...style,
      }}
    />
  );
}
