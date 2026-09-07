import type { CustomAgentRole, CustomAgentRoleInput } from "@openducktor/contracts";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { host } from "@/state/operations/host";
import { customAgentRolesQueryOptions } from "@/state/queries/workspace-sessions";

const roleMutationKey = ["custom-agent-role-edit"] as const;

function CustomAgentRoleEditor({
  role,
  disabled,
  onSaved,
  onDeleted,
}: {
  role: CustomAgentRole | null;
  disabled: boolean;
  onSaved: (role: CustomAgentRole) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(role?.systemPrompt ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useMutation({
    mutationKey: roleMutationKey,
    mutationFn: (input: CustomAgentRoleInput) =>
      role ? host.customAgentRoleUpdate(role.id, input) : host.customAgentRoleCreate(input),
    onSuccess: onSaved,
  });
  const remove = useMutation({
    mutationKey: roleMutationKey,
    mutationFn: (id: string) => host.customAgentRoleDelete(id),
    onSuccess: (_, id) => onDeleted(id),
  });
  const pending = save.isPending || remove.isPending;
  const error = save.error ?? remove.error;
  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ name, systemPrompt });
        }}
      >
        <fieldset disabled={disabled || pending} className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="custom-role-name">Role name</Label>
            <Input
              id="custom-role-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-role-prompt">System prompt</Label>
            <Textarea
              id="custom-role-prompt"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              rows={12}
              required
              className="font-mono text-sm"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(error)}
            </p>
          )}
          {save.isSuccess && (
            <p role="status" className="text-sm text-muted-foreground">
              Role saved. Existing sessions keep their original instructions.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit">
              {save.isPending && <LoaderCircle className="animate-spin" />}Save role
            </Button>
            {role && (
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
                Delete role
              </Button>
            )}
          </div>
        </fieldset>
      </form>
      <Dialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!pending) setConfirmDelete(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {role?.name}?</DialogTitle>
            <DialogDescription>
              This removes the role from future session choices. Existing sessions keep their saved
              instructions.
            </DialogDescription>
          </DialogHeader>
          {remove.error && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(remove.error)}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (role) remove.mutate(role.id);
              }}
            >
              {remove.isPending && <LoaderCircle className="animate-spin" />}Delete role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SettingsCustomAgentRolesSection({ disabled }: { disabled: boolean }) {
  const queryClient = useQueryClient();
  const pending = useIsMutating({ mutationKey: roleMutationKey }) > 0;
  const options = customAgentRolesQueryOptions();
  const roles = useQuery(options);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newRoleGeneration, setNewRoleGeneration] = useState(0);
  const selectedRole = roles.data?.find((role) => role.id === selectedId) ?? null;
  if (roles.isPending) return <p role="status">Loading custom roles…</p>;
  if (roles.isError)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-destructive">{errorMessage(roles.error)}</p>
        <Button variant="outline" onClick={() => void roles.refetch()}>
          Retry
        </Button>
      </div>
    );
  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Custom Agent Roles</h2>
        <p className="text-sm text-muted-foreground">
          Reusable instructions for Workspace Sessions in every workspace. Save each role here.
          Changes apply to new sessions only.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Combobox
          value={selectedId ?? ""}
          onValueChange={setSelectedId}
          placeholder="Choose a role to edit"
          disabled={disabled || pending}
          options={roles.data.map((role) => ({ value: role.id, label: role.name }))}
          triggerClassName="flex-1"
        />
        <Button
          variant="outline"
          disabled={disabled || pending}
          onClick={() => {
            setSelectedId(null);
            setNewRoleGeneration((value) => value + 1);
          }}
        >
          <Plus />
          New role
        </Button>
      </div>
      <CustomAgentRoleEditor
        key={selectedRole?.id ?? `new-${newRoleGeneration}`}
        role={selectedRole}
        disabled={disabled}
        onSaved={(role) => {
          void queryClient.cancelQueries({ queryKey: options.queryKey });
          queryClient.setQueryData(options.queryKey, (current) =>
            [...(current ?? []).filter((entry) => entry.id !== role.id), role].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
          );
          setSelectedId(role.id);
        }}
        onDeleted={(id) => {
          void queryClient.cancelQueries({ queryKey: options.queryKey });
          queryClient.setQueryData(options.queryKey, (current) =>
            current?.filter((entry) => entry.id !== id),
          );
          setSelectedId(null);
        }}
      />
    </section>
  );
}
