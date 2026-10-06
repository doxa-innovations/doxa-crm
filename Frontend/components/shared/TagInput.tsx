"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface TagInputProps {
  className?: string;
  disabled?: boolean;
  onChange: (tags: string[]) => void;
  placeholder?: string;
  value: string[];
}

function normalizeTag(tag: string): string {
  return tag.trim();
}

export function TagInput({
  className,
  disabled = false,
  onChange,
  placeholder = "Add tag",
  value,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  function addTag(rawTag: string) {
    const tag = normalizeTag(rawTag);
    if (!tag || value.includes(tag)) {
      setDraft("");
      return;
    }

    onChange([...value, tag]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((item) => item !== tag));
  }

  return (
    <div
      className={cn(
        "flex min-h-10 w-full flex-wrap items-center gap-2 rounded-md border border-[var(--input)] bg-white px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-[var(--ring)]",
        className,
      )}
    >
      {value.map((tag) => (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-[var(--background)] px-2 py-1 text-xs font-medium text-[var(--primary)]"
          key={tag}
        >
          {tag}
          <button
            className="rounded-full text-[var(--primary)] hover:bg-blue-100"
            disabled={disabled}
            onClick={() => removeTag(tag)}
            type="button"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Remove {tag}</span>
          </button>
        </span>
      ))}
      <input
        className="min-w-32 flex-1 border-0 bg-transparent p-0 text-sm text-slate-950 outline-none placeholder:text-slate-400"
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addTag(draft);
          }
        }}
        onBlur={() => addTag(draft)}
        placeholder={placeholder}
        value={draft}
      />
    </div>
  );
}
