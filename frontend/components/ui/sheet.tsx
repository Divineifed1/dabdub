"use client";

import * as Dialog from "@radix-ui/react-dialog";

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetContent = Dialog.Content;
export const SheetHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col items-center">{children}</div>
);
export const SheetTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-lg font-bold">{children}</h2>
);
