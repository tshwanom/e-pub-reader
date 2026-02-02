# UploadThing Setup Guide

## Quick Start

1. **Create an UploadThing account** at [uploadthing.com](https://uploadthing.com)

2. **Get your API keys** from the [UploadThing dashboard](https://uploadthing.com/dashboard)

3. **Add keys to `.env`**:

   ```bash
   UPLOADTHING_SECRET="sk_live_..."
   UPLOADTHING_APP_ID="your_app_id"
   ```

4. **Restart the dev server** to load the new environment variables

5. **Test uploads** at `http://localhost:3000` using the File Upload Demo section

## Available Upload Endpoints

### 1. ePub Uploader (`epubUploader`)

- **File Type**: `application/epub+zip`
- **Max Size**: 50MB
- **Max Files**: 1 per upload
- **Use Case**: Book files

### 2. Cover Image Uploader (`coverImageUploader`)

- **File Type**: Images (jpg, png, webp, etc.)
- **Max Size**: 4MB
- **Max Files**: 1 per upload
- **Use Case**: Book cover images

### 3. Audio Uploader (`audioUploader`)

- **File Type**: Audio files (mp3, m4a, wav, etc.)
- **Max Size**: 512MB per file
- **Max Files**: 10 per upload
- **Use Case**: Audiobook chapters

## Usage in Components

### Using the Upload Button

```tsx
import { UploadButton } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

export function MyComponent() {
  return (
    <UploadButton<OurFileRouter, "epubUploader">
      endpoint="epubUploader"
      onClientUploadComplete={(res) => {
        console.log("Files: ", res);
        // res[0].url contains the uploaded file URL
      }}
      onUploadError={(error: Error) => {
        alert(`ERROR! ${error.message}`);
      }}
    />
  );
}
```

### Using the Upload Dropzone

```tsx
import { UploadDropzone } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

export function MyComponent() {
  return (
    <UploadDropzone<OurFileRouter, "coverImageUploader">
      endpoint="coverImageUploader"
      onClientUploadComplete={(res) => {
        console.log("Files: ", res);
      }}
      onUploadError={(error: Error) => {
        alert(`ERROR! ${error.message}`);
      }}
    />
  );
}
```

### Programmatic Upload

```tsx
import { useUploadThing } from "@/lib/uploadthing";

export function MyComponent() {
  const { startUpload, isUploading } = useUploadThing("audioUploader");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const res = await startUpload(Array.from(files));
    console.log("Uploaded files:", res);
  };

  return (
    <input
      type="file"
      accept="audio/*"
      multiple
      onChange={handleFileChange}
      disabled={isUploading}
    />
  );
}
```

## File Structure

```
app/
├── api/
│   └── uploadthing/
│       ├── core.ts          # File router configuration
│       └── route.ts         # API route handler
└── uploadthing.css          # UploadThing styles

components/
└── UploadThingDemo.tsx      # Demo component

lib/
└── uploadthing.ts           # React helpers
```

## Next Steps

When building the admin panel, you'll use these upload endpoints to:

1. **Upload ePub files** when creating/editing books
2. **Upload cover images** for book thumbnails
3. **Upload audiobook files** for audio content

The uploaded file URLs will be stored in the database (`BookFile`, `AudioFile` models) and served to users when they read or listen to books.

## Customization

To modify upload limits or add new endpoints, edit `app/api/uploadthing/core.ts`:

```typescript
export const ourFileRouter = {
  // Add a new endpoint
  thumbnailUploader: f({ image: { maxFileSize: "2MB" } })
    .middleware(async ({ req }) => {
      const user = await auth(req);
      if (!user) throw new UploadThingError("Unauthorized");
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Thumbnail uploaded:", file.url);
      return { url: file.url };
    }),
};
```

## Troubleshooting

### Upload button not appearing

- Check that environment variables are set
- Restart the dev server after adding `.env` variables
- Check browser console for errors

### Upload fails

- Verify API keys are correct
- Check file size limits
- Ensure file type matches endpoint configuration

### Styling issues

- Make sure `app/uploadthing.css` is imported in `app/layout.tsx`
- UploadThing styles are imported globally

## Resources

- [UploadThing Documentation](https://docs.uploadthing.com)
- [UploadThing Dashboard](https://uploadthing.com/dashboard)
- [File Router API Reference](https://docs.uploadthing.com/api-reference/server#file-routes)
