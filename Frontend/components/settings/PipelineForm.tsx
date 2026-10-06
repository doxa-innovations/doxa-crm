"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { Pipeline, PipelineCreate } from "@/types/api";

const pipelineFormSchema = z.object({
  is_default: z.boolean(),
  name: z.string().min(1, "Pipeline name is required."),
});

type PipelineFormValues = z.infer<typeof pipelineFormSchema>;

interface PipelineFormProps {
  onOpenChange: (open: boolean) => void;
  onSaved?: (pipeline: Pipeline) => void;
  open: boolean;
}

function defaultValues(): PipelineFormValues {
  return {
    is_default: false,
    name: "",
  };
}

export function PipelineForm({
  onOpenChange,
  onSaved,
  open,
}: PipelineFormProps) {
  const queryClient = useQueryClient();
  const form = useForm<PipelineFormValues>({
    defaultValues: defaultValues(),
    resolver: zodResolver(pipelineFormSchema),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues());
    }
  }, [form, open]);

  const createPipeline = useMutation({
    mutationFn: (values: PipelineFormValues) =>
      api.post<Pipeline, PipelineCreate>("/pipelines/", {
        is_default: values.is_default,
        name: values.name,
        stages: [],
      }),
    onSuccess: (pipeline) => {
      void queryClient.invalidateQueries({ queryKey: ["pipelines"] });
      onSaved?.(pipeline);
      onOpenChange(false);
    },
  });

  const submitting = createPipeline.isPending;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Pipeline</DialogTitle>
          <DialogDescription>
            Create a pipeline, then add stages in order.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={form.handleSubmit((values) =>
            createPipeline.mutate(values),
          )}
        >
          <div>
            <Label htmlFor="pipeline_name">Pipeline Name</Label>
            <Input
              id="pipeline_name"
              disabled={submitting}
              {...form.register("name")}
            />
            {form.formState.errors.name?.message ? (
              <p className="mt-1 text-xs text-red-600">
                {form.formState.errors.name.message}
              </p>
            ) : null}
          </div>

          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm text-[var(--navy)]">
            <input
              className="h-4 w-4 rounded border-slate-300 text-[var(--primary)]"
              disabled={submitting}
              type="checkbox"
              {...form.register("is_default")}
            />
            Is Default
          </label>

          {createPipeline.isError ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Could not create pipeline.
            </div>
          ) : null}

          <div className="grid gap-3 sm:flex sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={submitting}
              type="submit"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Pipeline
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
