import { useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";

const defaultFormat = (v) => Math.round(v).toLocaleString("en-IN");

export default function AnimatedCounter({ value, format = defaultFormat, className = "" }) {
  const numericValue = Number(value) || 0;
  const spring = useSpring(numericValue, { stiffness: 90, damping: 22 });
  const display = useTransform(spring, (v) => format(v));

  useEffect(() => {
    spring.set(numericValue);
  }, [spring, numericValue]);

  return <motion.span className={`tabular-nums font-mono ${className}`}>{display}</motion.span>;
}
