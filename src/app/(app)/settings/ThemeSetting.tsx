"use client";

import { useTheme, type ThemePref } from "@/components/shell/theme";
import { Segmented } from "@/components/ui/Segmented";

/** Light / Night / System, stored on this device (same setting as the avatar menu). */
export default function ThemeSetting() {
  const [theme, setTheme] = useTheme();
  return (
    <Segmented<ThemePref>
      label="Theme"
      value={theme}
      onChange={setTheme}
      options={[
        { value: "light", label: "Light" },
        { value: "night", label: "Night" },
        { value: "system", label: "System" },
      ]}
    />
  );
}
