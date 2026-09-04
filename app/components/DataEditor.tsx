"use client";
import { t } from "@/app/lib/i18n";
import { FormEvent, useState } from "react";

interface EditableField {
  name: string;
  label: string;
  type: "text" | "select";
  options?: string[];
  required?: boolean;
}

interface DataEditorProps {
  title: string;
  fields: EditableField[];
  initialData: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<boolean>;
  onCancel: () => void;
}

export default function DataEditor({
  title,
  fields,
  initialData,
  onSave,
  onCancel,
}: DataEditorProps) {
  const [formData, setFormData] = useState<Record<string, any>>(initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (fieldName: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    for (const field of fields) {
      if (field.required && !formData[field.name]?.toString().trim()) {
        setError(`${field.label} is required`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const success = await onSave(formData);
      if (success) {
        onCancel();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed_to_save", "Failed to save"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">{title}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
              {field.type === "text" ? (
                <input
                  type="text"
                  value={formData[field.name] || ""}
                  onChange={(event) => handleChange(field.name, event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={field.required}
                />
              ) : (
                <select
                  value={formData[field.name] || ""}
                  onChange={(event) => handleChange(field.name, event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required={field.required}
                >
                  <option value="">{t("select", "Select...")}</option>
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}

          {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded">{error}</div>}

          <div className="flex gap-2 pt-4">
            <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300" disabled={isSaving}>
              {t("cancel", "Cancel")}
            </button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400" disabled={isSaving}>
              {isSaving ? t("saving", "Saving...") : t("save", "Save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
