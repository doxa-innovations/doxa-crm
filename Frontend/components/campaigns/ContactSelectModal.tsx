"use client";
import {
  useRecordOptions,
  RecordOptionsStatus,
} from "@/hooks/useRecordOptions";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type {
  CampaignEnrollRequest,
  CampaignEnrollment,
  Contact,
} from "@/types/api";

interface ContactSelectModalProps {
  campaignId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debounced;
}

function contactName(contact: Contact): string {
  return `${contact.first_name} ${contact.last_name}`;
}

function isAlreadyEnrolled(enrollment?: CampaignEnrollment): boolean {
  return Boolean(enrollment && enrollment.status !== "unsubscribed");
}

export function ContactSelectModal({
  campaignId,
  onOpenChange,
  open,
}: ContactSelectModalProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebouncedValue(search, 300);
  const contactsQuery = useRecordOptions<Contact>(
    "/contacts/",
    { search: debouncedSearch || undefined },
    ["contacts", "enrollment", debouncedSearch],
  );
  const enrollmentsQuery = useRecordOptions<CampaignEnrollment>(
    `/campaigns/${campaignId}/enrollments`,
    {},
    ["campaigns", "enrollments", campaignId],
  );
  const contacts = useMemo(() => {
    const normalized = debouncedSearch.toLowerCase();
    return (contactsQuery.data ?? []).filter((contact) =>
      `${contactName(contact)} ${contact.email}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [contactsQuery.data, debouncedSearch]);
  const enrollmentMap = useMemo(
    () =>
      new Map(
        (enrollmentsQuery.data ?? []).map((enrollment) => [
          enrollment.contact_id,
          enrollment,
        ]),
      ),
    [enrollmentsQuery.data],
  );
  const enrollContacts = useMutation({
    mutationFn: () =>
      api.post<CampaignEnrollment[], CampaignEnrollRequest>(
        `/campaigns/${campaignId}/enroll`,
        {
          contact_ids: Array.from(selectedIds),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({
        queryKey: ["campaigns", "detail", campaignId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["campaigns", "enrollments", campaignId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["campaigns", "metrics", campaignId],
      });
      setSelectedIds(new Set());
      onOpenChange(false);
    },
  });

  function toggleContact(contactId: string, checked: boolean) {
    if (isAlreadyEnrolled(enrollmentMap.get(contactId))) {
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(contactId);
      } else {
        next.delete(contactId);
      }
      return next;
    });
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setSelectedIds(new Set());
          setSearch("");
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enroll Contacts</DialogTitle>
          <DialogDescription>
            Search contacts and enroll selected people into this campaign.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search contacts"
              value={search}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[var(--background)] px-3 py-1 text-sm font-semibold text-[var(--primary)]">
              {selectedIds.size} selected
            </span>
            {enrollmentsQuery.isLoading ? (
              <span className="text-xs text-[var(--muted-foreground)]">
                Checking current enrollments...
              </span>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
            {contactsQuery.isLoading ? (
              <div className="p-4 text-sm text-[var(--muted-foreground)]">
                Loading contacts...
              </div>
            ) : null}
            {!contactsQuery.isLoading && contacts.length === 0 ? (
              <div className="p-4 text-sm text-[var(--muted-foreground)]">
                No contacts found.
              </div>
            ) : null}
            {contacts.map((contact) => {
              const enrollment = enrollmentMap.get(contact.id);
              const alreadyEnrolled = isAlreadyEnrolled(enrollment);
              const canReEnroll = enrollment?.status === "unsubscribed";

              return (
                <label
                  className={`flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${
                    alreadyEnrolled
                      ? "cursor-not-allowed bg-slate-50"
                      : "cursor-pointer hover:bg-[var(--background)]"
                  }`}
                  key={contact.id}
                >
                  <input
                    checked={alreadyEnrolled || selectedIds.has(contact.id)}
                    className="h-4 w-4 rounded border-slate-300"
                    disabled={alreadyEnrolled}
                    onChange={(event) =>
                      toggleContact(contact.id, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--navy)]">
                      {contactName(contact)}
                    </p>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {contact.email}
                    </p>
                  </div>
                  {alreadyEnrolled ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-[var(--muted-foreground)]">
                      Already enrolled
                    </span>
                  ) : null}
                  {canReEnroll ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      Re-enroll
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <RecordOptionsStatus query={contactsQuery} label="contacts" />
          <RecordOptionsStatus query={enrollmentsQuery} label="enrollments" />
          {enrollContacts.isError ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Could not enroll contacts.
            </div>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="bg-[var(--primary)] hover:bg-blue-700"
              disabled={selectedIds.size === 0 || enrollContacts.isPending}
              onClick={() => enrollContacts.mutate()}
              type="button"
            >
              Enroll {selectedIds.size} contacts
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
