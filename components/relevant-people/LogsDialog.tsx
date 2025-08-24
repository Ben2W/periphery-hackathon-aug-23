"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Log = {
  _id: string;
  _creationTime: number;
  level: string;
  message: string;
  step?: string;
};

export function LogsDialog({ logs }: { logs: Array<Log> | undefined }) {
  return (
    <div>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            View logs
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>GitHub scrape logs</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto text-sm space-y-2">
            {logs?.map((l) => (
              <div key={l._id} className="flex gap-2">
                <span className="text-muted-foreground">
                  {new Date(l._creationTime).toLocaleTimeString()}
                </span>
                <span className="uppercase text-xs font-medium">{l.level}</span>
                {l.step && (
                  <span className="text-xs text-muted-foreground">
                    [{l.step}]
                  </span>
                )}
                <span>{l.message}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
