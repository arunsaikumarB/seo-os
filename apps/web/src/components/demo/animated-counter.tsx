import { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

export function AnimatedCounter({
  value,
  duration = 1.2,
  suffix = '',
  className = '',
}: {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
}) {
  const spring = useSpring(0, { stiffness: 60, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString());
  const [text, setText] = useState('0');

  useEffect(() => {
    spring.set(value);
    const unsub = display.on('change', (v) => setText(v));
    return unsub;
  }, [value, spring, display]);

  return (
    <motion.span
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration * 0.5 }}
    >
      {text}
      {suffix}
    </motion.span>
  );
}
