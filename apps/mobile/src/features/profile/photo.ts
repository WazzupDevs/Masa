import { preparePhotoUpload } from '@shared/jpegMetadata.ts';
import {
  PHOTO_BUCKET,
  PHOTO_JPEG_QUALITY,
  PHOTO_MAX_BYTES,
  PHOTO_SIZE_PX,
} from '@shared/profile.ts';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { profileApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export type PhotoSource = 'library' | 'camera';

export class PhotoError extends Error {
  readonly reason: 'permission' | 'invalid';

  constructor(reason: 'permission' | 'invalid') {
    super(`photo ${reason}`);
    this.name = 'PhotoError';
    this.reason = reason;
  }
}

// Re-encodes to a 512×512 JPEG (which drops EXIF, GPS, XMP and the rest), then strips and checks
// the result with the same module photo-commit uses (docs/SPEC_V2.md §5.3). Nothing leaves the
// phone unless the check passes.
async function reencode(uri: string, width: number, height: number): Promise<ArrayBuffer> {
  const side = Math.min(width, height);
  let context = ImageManipulator.manipulate(uri);
  if (width !== height) {
    context = context.crop({
      originX: Math.floor((width - side) / 2),
      originY: Math.floor((height - side) / 2),
      width: side,
      height: side,
    });
  }
  const image = await context.resize({ width: PHOTO_SIZE_PX, height: PHOTO_SIZE_PX }).renderAsync();
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: PHOTO_JPEG_QUALITY,
    base64: true,
  });
  if (!saved.base64) throw new PhotoError('invalid');
  const prepared = preparePhotoUpload(saved.base64, PHOTO_MAX_BYTES);
  if (!prepared.ok) throw new PhotoError('invalid');
  return new Uint8Array(prepared.bytes).buffer;
}

// Picks, re-encodes, uploads to a one-time signed URL and commits. False if the user cancelled.
export async function choosePhoto(source: PhotoSource): Promise<boolean> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoError('permission');

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return false;

  const bytes = await reencode(asset.uri, asset.width, asset.height);
  const { path, token } = await profileApi.photoUploadUrl();
  const upload = await supabase.storage
    .from(PHOTO_BUCKET)
    .uploadToSignedUrl(path, token, bytes, { contentType: 'image/jpeg' });
  if (upload.error) throw new PhotoError('invalid');
  await profileApi.photoCommit(path);
  return true;
}
