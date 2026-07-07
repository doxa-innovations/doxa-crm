"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  CustomFieldsEditor,
  customFieldRowsToRecord,
  customFieldsRecordToRows,
  type CustomFieldRow,
} from "@/components/shared/CustomFieldsEditor";
import { TagInput } from "@/components/shared/TagInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import type { Account, Contact, ContactCreate, ContactUpdate, User } from "@/types/api";

const contactFormSchema = z
  .object({
    account_id: z.string().optional(),
    custom_fields: z.array(
      z.object({
        id: z.string(),
        key: z.string(),
        value: z.string(),
      }),
    ),
    email: z.string().email("Enter a valid email address."),
    first_name: z.string().min(1, "First name is required."),
    last_name: z.string().min(1, "Last name is required."),
    owner_id: z.string().optional(),
    phone: z.string().min(1, "Phone is required."),
    sms_opted_in: z.boolean(),
    sms_opted_out: z.boolean(),
    tags: z.array(z.string()),
    title: z.string().min(1, "Title is required."),
  })
  .refine((values) => !(values.sms_opted_in && values.sms_opted_out), {
    message: "Choose SMS opt-in or opt-out.",
    path: ["sms_opted_out"],
  });

type ContactFormValues = z.infer<typeof contactFormSchema>;

interface ContactFormProps {
  contact?: Contact | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (contact: Contact) => void;
  open: boolean;
}

interface AccountOption {
  id: string;
  name: string;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debounced;
}

function emptyValues(): ContactFormValues {
  return {
    account_id: "",
    custom_fields: [],
    email: "",
    first_name: "",
    last_name: "",
    owner_id: "",
    phone: "",
    sms_opted_in: false,
    sms_opted_out: false,
    tags: [],
    title: "",
  };
}

function valuesFromContact(contact?: Contact | null): ContactFormValues {
  if (!contact) {
    return emptyValues();
  }

  return {
    account_id: contact.account_id ?? "",
    custom_fields: customFieldsRecordToRows(contact.custom_fields),
    email: contact.email,
    first_name: contact.first_name,
    last_name: contact.last_name,
    owner_id: contact.owner_id,
    phone: contact.phone,
    sms_opted_in: Boolean(contact.sms_opted_in_at && !contact.sms_opted_out_at),
    sms_opted_out: Boolean(contact.sms_opted_out_at),
    tags: contact.tags,
    title: contact.title,
  };
}

function fieldError(message?: string) {
  return message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;
}

function buildPayload(values: ContactFormValues, contact?: Contact | null): ContactCreate | ContactUpdate {
  const now = new Date().toISOString();

  return {
    account_id: values.account_id || null,
    custom_fields: customFieldRowsToRecord(values.custom_fields),
    email: values.email,
    first_name: values.first_name,
    last_name: values.last_name,
    owner_id: values.owner_id || null,
    phone: values.phone,
    sms_opted_in_at: values.sms_opted_in ? contact?.sms_opted_in_at ?? now : null,
    sms_opted_out_at: values.sms_opted_out ? contact?.sms_opted_out_at ?? now : null,
    tags: values.tags,
    title: values.title,
  };
}

export function ContactForm({ contact, onOpenChange, onSaved, open }: ContactFormProps) {
  const queryClient = useQueryClient();
  const [accountSearch, setAccountSearch] = useState(contact?.account_name ?? "");
  const debouncedAccountSearch = useDebouncedValue(accountSearch, 300);
  const form = useForm<ContactFormValues>({
    defaultValues: valuesFromContact(contact),
    resolver: zodResolver(contactFormSchema),
  });
  const tags = form.watch("tags");
  const customFields = form.watch("custom_fields");

  useEffect(() => {
    if (open) {
      form.reset(valuesFromContact(contact));
      setAccountSearch(contact?.account_name ?? "");
    }
  }, [contact, form, open]);

  const accountsQuery = useQuery({
    queryFn: () => api.get<Account[]>("/accounts/", { page_size: 20, search: debouncedAccountSearch || undefined }),
    queryKey: ["accounts", "search-select", debouncedAccountSearch],
  });
  const usersQuery = useQuery({
    queryFn: () => api.get<User[]>("/users/"),
    queryKey: ["users", "owner-select"],
    retry: false,
  });

  const accountOptions = useMemo<AccountOption[]>(() => {
    const options = (accountsQuery.data ?? []).map((account) => ({ id: account.id, name: account.name }));

    if (contact?.account_id && contact.account_name && !options.some((account) => account.id === contact.account_id)) {
      options.unshift({ id: contact.account_id, name: contact.account_name });
    }

    const normalizedSearch = debouncedAccountSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return options;
    }

    return options.filter((account) => account.name.toLowerCase().includes(normalizedSearch));
  }, [accountsQuery.data, contact?.account_id, contact?.account_name, debouncedAccountSearch]);

  const saveContact = useMutation({
    mutationFn: (values: ContactFormValues) => {
      const payload = buildPayload(values, contact);
      if (contact) {
        return api.patch<Contact, ContactUpdate>(`/contacts/${contact.id}`, payload);
      }

      return api.post<Contact, ContactCreate>("/contacts/", payload as ContactCreate);
    },
    onSuccess: (savedContact) => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved?.(savedContact);
      onOpenChange(false);
    },
  });

  const submitting = saveContact.isPending;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{contact ? "Edit Contact" : "New Contact"}</SheetTitle>
          <SheetDescription>{contact ? "Update contact metadata and ownership." : "Create a CRM contact record."}</SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={form.handleSubmit((values) => saveContact.mutate(values))}>
          <SheetBody className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="first_name">First Name</Label>
                <Input id="first_name" disabled={submitting} {...form.register("first_name")} />
                {fieldError(form.formState.errors.first_name?.message)}
              </div>
              <div>
                <Label htmlFor="last_name">Last Name</Label>
                <Input id="last_name" disabled={submitting} {...form.register("last_name")} />
                {fieldError(form.formState.errors.last_name?.message)}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" disabled={submitting} type="email" {...form.register("email")} />
                {fieldError(form.formState.errors.email?.message)}
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" disabled={submitting} {...form.register("phone")} />
                {fieldError(form.formState.errors.phone?.message)}
              </div>
            </div>

            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" disabled={submitting} {...form.register("title")} />
              {fieldError(form.formState.errors.title?.message)}
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-[#0F2444]">Messaging Preferences</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm font-medium text-[#0F2444]" htmlFor="sms_opted_in">
                  <input
                    className="h-4 w-4 rounded border-slate-300 text-[#2563EB]"
                    disabled={submitting}
                    id="sms_opted_in"
                    type="checkbox"
                    {...form.register("sms_opted_in")}
                  />
                  SMS opt-in
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-[#0F2444]" htmlFor="sms_opted_out">
                  <input
                    className="h-4 w-4 rounded border-slate-300 text-[#2563EB]"
                    disabled={submitting}
                    id="sms_opted_out"
                    type="checkbox"
                    {...form.register("sms_opted_out")}
                  />
                  SMS opt-out
                </label>
              </div>
              {fieldError(form.formState.errors.sms_opted_out?.message)}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="account_search">Account</Label>
                <Input
                  id="account_search"
                  disabled={submitting}
                  onChange={(event) => setAccountSearch(event.target.value)}
                  placeholder="Search accounts"
                  value={accountSearch}
                />
                <select
                  className="mt-2 h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                  disabled={submitting}
                  {...form.register("account_id")}
                >
                  <option value="">No account</option>
                  {accountOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="owner_id">Owner</Label>
                <select
                  className="h-10 w-full rounded-md border border-[var(--input)] bg-white px-3 text-sm text-slate-950"
                  disabled={submitting}
                  id="owner_id"
                  {...form.register("owner_id")}
                >
                  <option value="">Current user</option>
                  {(usersQuery.data ?? []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label>Tags</Label>
              <TagInput disabled={submitting} onChange={(nextTags) => form.setValue("tags", nextTags, { shouldDirty: true })} value={tags} />
            </div>

            <div>
              <Label>Custom Fields</Label>
              <div className="mt-2">
                <CustomFieldsEditor
                  disabled={submitting}
                  onChange={(rows: CustomFieldRow[]) => form.setValue("custom_fields", rows, { shouldDirty: true })}
                  rows={customFields}
                />
              </div>
            </div>

            {saveContact.isError ? (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Could not save contact.</div>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button disabled={submitting} onClick={() => onOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button className="bg-[#2563EB] hover:bg-blue-700" disabled={submitting} type="submit">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Contact
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
