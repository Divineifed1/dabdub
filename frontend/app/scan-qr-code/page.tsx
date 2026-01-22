"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Sheet } from "react-modal-sheet";
import {
  ArrowLeft,
  ArrowLeftCircle,
  Camera,
  QrCode,
  Share,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";

// Dynamically import the scanner (no SSR)
const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  { ssr: false },
);

export default function ScanQRCodePage() {
  const [qrValue, setQrValue] = useState("");
  const [open, setOpen] = useState(true);

  return (
    <main className="w-full h-screen bg-black relative">
      {/* QR Camera */}
      <div className="relative w-full h-screen">
        {/* <div className="bg-transparent text-[white]"> tumi</div> */}
        <Scanner
          onDecode={(result) => setQrValue(result)}
          onError={(err) => console.error(err)}
          constraints={{ facingMode: "environment" }}
          className="absolute top-0 left-0 w-full h-full object-cover"
        />
        {/* Overlay text */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 text-white text-lg font-bold w-full flex items-center justify-center mt-[1rem]">
          <div className="w-[90%] flex items-center justify-between">
            <div className="p-[.5rem] rounded-full border">
              <ArrowLeft className="stroke-[1px]" />
            </div>
            <h3>Scan to pay</h3>
            <div className="p-[.5rem] rounded-full border">
              <Camera className="stroke-[1px]" />
            </div>
          </div>
        </div>
        <div className="absolute bottom-18 left-1/2 -translate-x-1/2 text-white text-lg font-bold w-full flex items-center justify-center mt-[1rem]">
          <div className="w-[95%] flex items-center justify-between ">
            <div className="flex items-center gap-[.15rem]">
              <Image
                src="/cheese.png"
                alt="cheese.png"
                width={20}
                height={20}
                className="rounded-full"
              />
              <h3>Cheese</h3>
            </div>
            <div className="flex items-center gap-[.15rem]">
              <Image
                src="/binance.png"
                alt="binance.png"
                width={20}
                height={20}
                className="rounded-full"
              />
              <h3>Binance</h3>
            </div>
            <div className="flex items-center gap-[.15rem]">
              <Image
                src="/metamask.png"
                alt="metamask.png"
                width={20}
                height={20}
                className="rounded-full"
              />
              <h3>Metamask</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Drawer */}
      <Sheet isOpen={open} onClose={() => setOpen(false)}>
        <Sheet.Container>
          <div className="bg-[#FFFCEE] h-full w-full flex flex-col items-center justify-center ">
            <Sheet.Header />

            <Sheet.Content>
              <div className="w-full flex flex-col items-center justify-center  p-6">
                <div className="w-full ">
                  <h2 className="flex justify-start text-black text-lg font-medium mb-4">
                    Show QR to Get Paid
                  </h2>
                </div>

                <div className="w-[80%] bg-black p-4 rounded-lg">
                  <QrCode size={200} className="text-white w-full" />
                </div>

                <p className="text-[#747474] mt-4 text-center">
                  Let others scan this to pay you
                </p>
                <div className=" w-full flex  items-center justify-between">
                  <Separator
                    orientation="horizontal"
                    className="[&[data-orientation=horizontal]]:w-1/3 [&[data-orientation=horizontal]]:bg-[#303030]"
                  />

                  <h3 className="text-[#303030]">or</h3>
                  <Separator className="[&[data-orientation=horizontal]]:w-1/3 [&[data-orientation=horizontal]]:bg-[#303030]" />
                </div>

                <div className="w-full bg-[#1B7339] flex justify-center items-center gap-[.5rem] py-[.5rem] text-[#E8F1EB] border-[2px] border-black mt-[1rem]">
                  <Share />
                  <h3>Share your profile</h3>
                </div>
              </div>
            </Sheet.Content>
          </div>
        </Sheet.Container>
      </Sheet>

      {/* Display scanned QR value */}
      {qrValue && (
        <div className="absolute top-4 left-4 bg-[#FFFCEE] text-black p-2 rounded">
          Scanned: {qrValue}
        </div>
      )}
    </main>
  );
}
