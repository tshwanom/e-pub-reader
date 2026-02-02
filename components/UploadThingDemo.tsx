"use client";

import { UploadButton } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

export function UploadThingDemo() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium mb-2">Upload ePub File</h3>
        <UploadButton<OurFileRouter, "epubUploader">
          endpoint="epubUploader"
          onClientUploadComplete={(res) => {
            console.log("Files: ", res);
            alert("Upload Completed!");
          }}
          onUploadError={(error: Error) => {
            alert(`ERROR! ${error.message}`);
          }}
        />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Upload Cover Image</h3>
        <UploadButton<OurFileRouter, "coverImageUploader">
          endpoint="coverImageUploader"
          onClientUploadComplete={(res) => {
            console.log("Files: ", res);
            alert("Upload Completed!");
          }}
          onUploadError={(error: Error) => {
            alert(`ERROR! ${error.message}`);
          }}
        />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Upload Audiobook</h3>
        <UploadButton<OurFileRouter, "audioUploader">
          endpoint="audioUploader"
          onClientUploadComplete={(res) => {
            console.log("Files: ", res);
            alert("Upload Completed!");
          }}
          onUploadError={(error: Error) => {
            alert(`ERROR! ${error.message}`);
          }}
        />
      </div>
    </div>
  );
}
