"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ConfirmDialogProps {
  confirmLabel?: string;
  confirmVariant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  description?: string;
  iconTone?: "danger" | "warning";
  isPending?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title?: string;
}

export function ConfirmDialog({
  confirmLabel = "Confirm",
  confirmVariant = "destructive",
  description = "This cannot be undone. Are you sure?",
  iconTone = "danger",
  isPending = false,
  onConfirm,
  onOpenChange,
  open,
  title = "Confirm action",
}: ConfirmDialogProps) {
  const iconClassName =
    iconTone === "warning"
      ? "mb-2 grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-amber-700"
      : "mb-2 grid h-10 w-10 place-items-center rounded-full bg-red-50 text-red-700";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className={iconClassName}>
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3">
          <Button disabled={isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={isPending} onClick={onConfirm} type="button" variant={confirmVariant}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
