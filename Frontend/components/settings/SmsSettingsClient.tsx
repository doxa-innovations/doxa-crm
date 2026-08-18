"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Save } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import type { SmsSettings, SmsSettingsUpdate } from "@/types/api";

const smsFormSchema = z.object({
  api_key: z.string().optional(),
  base_url: z.string().min(1, "Base URL is required."),
  identifier_id: z.string().optional(),
  method: z.enum(["GET", "POST"]),
  send_path: z.string().min(1, "Send path is required."),
  sender_name: z.string().optional(),
});

type SmsFormValues = z.infer<typeof smsFormSchema>;

function valuesFromSettings(settings?: SmsSettings): SmsFormValues {
  return {
    api_key: "",
    base_url: settings?.base_url ?? "https://api.afromessage.com",
    identifier_id: settings?.identifier_id ?? "",
    method: settings?.method === "GET" ? "GET" : "POST",
    send_path: settings?.send_path ?? "/api/send",
    sender_name: settings?.sender_name ?? "",
  };
}

function fieldError(message?: string) {
  return message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;
}

export function SmsSettingsClient() {
  const queryClient = useQueryClient();
  const { canAccessSettings } = usePermissions();

  const settingsQuery = useQuery({
    queryFn: () => api.get<SmsSettings>("/settings/sms/"),
    queryKey: ["sms-settings"],
  });

  const form = useForm<SmsFormValues>({
    defaultValues: valuesFromSettings(settingsQuery.data),
    resolver: zodResolver(smsFormSchema),
  });

  useEffect(() => {
    if (settingsQuery.data) {
      form.reset(valuesFromSettings(settingsQuery.data));
    }
  }, [form, settingsQuery.data]);

  const saveSettings = useMutation({
    meta: { successMessage: "SMS settings saved" },
    mutationFn: (values: SmsFormValues) => {
      const payload: SmsSettingsUpdate = {
        base_url: values.base_url.trim(),
        identifier_id: values.identifier_id?.trim() ?? "",
        method: values.method,
        send_path: values.send_path.trim(),
        sender_name: values.sender_name?.trim() ?? "",
      };

      // Only send the API key when the user typed a new value, so we never
      // overwrite the stored key with a blank field on save.
      const nextApiKey = values.api_key?.trim();
      if (nextApiKey) {
        payload.api_key = nextApiKey;
      }

      return api.put<SmsSettings, SmsSettingsUpdate>("/settings/sms/", payload);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["sms-settings"], updated);
      void queryClient.invalidateQueries({ queryKey: ["sms-settings"] });
      form.reset(valuesFromSettings(updated));
    },
  });

  const submitting = saveSettings.isPending;
  const readOnly = !canAccessSettings;
  const settings = settingsQuery.data;

  return (
    <div className="grid gap-6">
      <PageHeader subtitle="Configure the AfroMessage credentials used to send campaign SMS." title="SMS Settings" />

      {settingsQuery.isLoading ? (
        <div className="rounded-lg border border-slate-200/70 bg-white p-4 text-sm text-[#64748B] shadow-sm sm:p-6">Loading SMS settings...</div>
      ) : null}
      {settingsQuery.isError ? (
        <div className="rounded-lg border border-red-100 bg-white p-4 text-sm text-red-700 shadow-sm">Could not load SMS settings.</div>
      ) : null}

      {settings ? (
        <section className="rounded-lg border border-slate-200/70 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
              <MessageSquare className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-[#0F2444]">AfroMessage</h2>
              <p className="mt-1 text-sm text-[#64748B]">These credentials are stored securely and used by the campaign worker to deliver SMS messages.</p>
            </div>
          </div>

          <form className="mt-6 grid max-w-2xl gap-5" onSubmit={form.handleSubmit((values) => saveSettings.mutate(values))}>
            <div>
              <Label htmlFor="sms_api_key">API Key</Label>
              <Input
                autoComplete="off"
                disabled={submitting || readOnly}
                id="sms_api_key"
                placeholder={settings.api_key_set ? `Current: ${settings.api_key_preview ?? "set"} — leave blank to keep` : "Enter API key"}
                type="password"
                {...form.register("api_key")}
              />
              <p className="mt-1 text-xs text-[#64748B]">
                {settings.api_key_set ? "An API key is configured. Enter a new value to replace it." : "No API key configured yet."}
              </p>
              {fieldError(form.formState.errors.api_key?.message)}
            </div>

            <div>
              <Label htmlFor="sms_identifier_id">Identifier ID (From)</Label>
              <Input disabled={submitting || readOnly} id="sms_identifier_id" placeholder="Optional sender identifier ID" {...form.register("identifier_id")} />
              {fieldError(form.formState.errors.identifier_id?.message)}
            </div>

            <div>
              <Label htmlFor="sms_sender_name">Sender Name</Label>
              <Input disabled={submitting || readOnly} id="sms_sender_name" placeholder="Optional sender name" {...form.register("sender_name")} />
              {fieldError(form.formState.errors.sender_name?.message)}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="sms_base_url">Base URL</Label>
                <Input disabled={submitting || readOnly} id="sms_base_url" {...form.register("base_url")} />
                {fieldError(form.formState.errors.base_url?.message)}
              </div>
              <div>
                <Label htmlFor="sms_send_path">Send Path</Label>
                <Input disabled={submitting || readOnly} id="sms_send_path" {...form.register("send_path")} />
                {fieldError(form.formState.errors.send_path?.message)}
              </div>
            </div>

            <div>
              <Label htmlFor="sms_method">HTTP Method</Label>
              <select
                className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950 disabled:opacity-60"
                disabled={submitting || readOnly}
                id="sms_method"
                {...form.register("method")}
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
              </select>
            </div>

            {saveSettings.isError ? <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Could not save SMS settings.</div> : null}

            {!readOnly ? (
              <div className="grid gap-3 sm:flex sm:justify-end">
                <Button className="w-full sm:w-auto" disabled={submitting} type="submit">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Save Settings
                </Button>
              </div>
            ) : (
              <p className="text-sm text-[#64748B]">You do not have permission to edit these settings.</p>
            )}
          </form>
        </section>
      ) : null}
    </div>
  );
}
