"use client";
import { t } from "@/app/lib/i18n";
import { useState } from "react";

interface QuickEditItemProps {
  label: string;
  fields: {
    name: string;
    value: string;
    placeholder?: string;
  }[];
  onEdit: (updatedValues: Record<string, string>) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}

export default function QuickEditItem({
  label,
  fields,
  onEdit,
  onDelete,
}: QuickEditItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>(
    fields.reduce((acc, f) => ({ ...acc, [f.name]: f.value }), {})
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await onEdit(editValues);
      if (success) {
        setIsEditing(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${label}?`)) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <div className="bg-zinc-900 border border-green-800/50 rounded p-3 space-y-2">
        {fields.map((field) => (
          <input
            key={field.name}
            type="text"
            value={editValues[field.name]}
            onChange={(e) => setEditValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
            placeholder={field.placeholder}
            className="w-full px-2 py-1 text-sm bg-zinc-800 border border-zinc-700 text-zinc-200 rounded placeholder-zinc-600 focus:outline-none focus:border-green-500"
          />
        ))}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-2 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-zinc-700 font-semibold"
          >
            {isSaving ? t("saving", "Saving...") : t("save", "✓ Save")}
          </button>
          <button
            onClick={() => {
              setEditValues(fields.reduce((acc, f) => ({ ...acc, [f.name]: f.value }), {}));
              setIsEditing(false);
            }}
            className="flex-1 px-2 py-1 text-sm bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 font-semibold"
          >
            {t("cancel", "✕ Cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-3 flex items-center justify-between gap-2">
      <span className="text-sm text-zinc-200">{label}</span>
      <div className="flex gap-2">
        <button
          onClick={() => setIsEditing(true)}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {t("edit", "Edit")}
        </button>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          {isDeleting ? t("deleting", "Deleting...") : t("delete", "Delete")}
        </button>
      </div>
    </div>
  );
}
