"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { useUploadDocument } from "@/hooks/use-knowledge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const ALLOWED_EXTENSIONS = [".pdf", ".md", ".txt"]

interface UploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UploadDialog({ open, onOpenChange }: UploadDialogProps) {
  const [title, setTitle] = useState("")
  const [visibility, setVisibility] = useState("internal")
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useUploadDocument()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    if (!selected) {
      setFile(null)
      setFileError(null)
      return
    }

    const ext = "." + (selected.name.split(".").pop()?.toLowerCase() ?? "")
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFile(null)
      setFileError("Only .pdf, .md, and .txt files are allowed.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    setFile(selected)
    setFileError(null)
    if (!title) {
      setTitle(selected.name.replace(/\.[^.]+$/, ""))
    }
  }

  function reset() {
    setTitle("")
    setVisibility("internal")
    setFile(null)
    setFileError(null)
    uploadMutation.reset()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleClose() {
    reset()
    onOpenChange(false)
  }

  function handleSubmit() {
    if (!title.trim() || !file || uploadMutation.isPending) return
    uploadMutation.mutate(
      { title: title.trim(), visibility, file },
      {
        onSuccess: () => {
          handleClose()
          toast.success("Document uploaded")
        },
        onError: (e) => toast.error((e as Error)?.message || "Upload failed"),
      }
    )
  }

  const canSubmit = !!title.trim() && !!file && !uploadMutation.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Knowledge Document</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Billing FAQ"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-visibility">Visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v ?? "internal")}>
              <SelectTrigger id="doc-visibility" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Internal only</SelectItem>
                <SelectItem value="client_visible">Client visible</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-file">File</Label>
            <input
              ref={fileInputRef}
              id="doc-file"
              type="file"
              accept=".pdf,.md,.txt"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:cursor-pointer file:transition-colors hover:file:bg-muted"
            />
            {fileError && (
              <p className="text-xs text-destructive" role="alert">
                {fileError}
              </p>
            )}
          </div>

          {uploadMutation.isError && (
            <p className="text-sm text-destructive" role="alert">
              {uploadMutation.error instanceof Error
                ? uploadMutation.error.message
                : "Upload failed. Please try again."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={handleClose}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="cursor-pointer"
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
