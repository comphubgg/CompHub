"use client";
import { t } from "@/app/lib/i18n";
import { useState } from "react";

interface EditModalProps {
  title: string;
  fields: { name: string; label: string; value: string }[];
  onSave: (values: Record<string, string>) => Promise<boolean>;
  onCancel: () => void;
}

export default function EditModal({
  title,
  fields,
  onSave,
  onCancel,
}: EditModalProps) {
  const [values, setValues] = useState<Record<string, string>>(
    fields.reduce((acc, f) => ({ ...acc, [f.name]: f.value }), {})
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await onSave(values);
      if (success) {
        onCancel();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error_saving", "Error saving"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold text-white mb-4">{title}</h2>

        <div className="space-y-3 mb-4">
          {fields.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-zinc-300 mb-1">{field.label}</label>
              <input
                type="text"
                value={values[field.name]}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 text-white rounded focus:outline-none focus:border-green-500"
              />
            </div>
          ))}
        </div>

        {error && <div className="bg-red-900/30 border border-red-800 text-red-300 px-3 py-2 rounded mb-4 text-sm">{error}</div>}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded hover:bg-zinc-700 disabled:opacity-50"
          >
            {t("cancel", "Cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-zinc-700 font-semibold"
          >
            {isSaving ? t("saving", "Saving...") : t("save", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
