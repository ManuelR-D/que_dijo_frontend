function getInitials(name: string): string {
  const parts = name.split(',').map(s => s.trim());
  // "APELLIDO, Nombre" → take first letter of each part
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface SenatorAvatarProps {
  src: string;
  name: string;
  className?: string;
}

export function SenatorAvatar({ src, name, className = 'w-10 h-10' }: SenatorAvatarProps) {
  if (src) {
    return <img src={src} alt={name} className={`${className} rounded-full object-cover`} />;
  }
  return (
    <div className={`${className} rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs select-none`}>
      {getInitials(name)}
    </div>
  );
}
