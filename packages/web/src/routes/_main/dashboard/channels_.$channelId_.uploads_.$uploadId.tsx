import { Accordion } from '@base-ui/react/accordion';
import { Combobox } from '@base-ui/react/combobox';
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { useStore } from '@nanostores/react';
import {
  IconBug,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconFlask,
  IconPhoto,
  IconRefresh,
  IconReload,
  IconSparkles,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconUpload,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from '@tanstack/react-router';
import type { HlsVideoElement } from 'hls-video-element';
import HlsVideo from 'hls-video-element/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';

import { LcMenu, MenuItemButton } from '@/components/lc-menu';
import { LcModal, ModalHeader } from '@/components/lc-modal';
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Checkbox,
  InputWrapper,
  Loader,
  LoadingOverlay,
  Progress,
  Radio,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@/components/ui';
import { Dropzone } from '@/components/ui/dropzone';
import { useAppForm } from '@/components/ui/form';
import { controlClasses } from '@/components/ui/input';
import { showFailure, showSuccess } from '@/components/ui/notifications';
import { useCopied } from '@/hooks/use-copied';
import { idTranslator } from '@/schemas/common';
import { uploadFormSchema } from '@/schemas/dashboard';
import { trpcClient, useTRPC } from '@/trpc/react';
import { cn } from '@/util/cn';
import { formatTime } from '@/util/format';
import { doMultipartUpload } from '@/util/multipart-upload';
import { stopMediaElement } from '@/util/stop-media-element';

import { SpeakerLabelingModal } from './-components/speaker-labeling-modal';
import {
  $localVideoThumbnails,
  $deletedUploads,
  $uploadProgress,
  retainLocalVideoThumbnails,
} from './channels_.$channelId_.uploads';

export const Route = createFileRoute(
  '/_main/dashboard/channels_/$channelId_/uploads_/$uploadId',
)({
  component: ChannelUploadPage,
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient.fetchQuery(
      context.trpc.common.hasValidSession.queryOptions(),
    );
    if (!hasSession) {
      throw redirect({ to: '/auth/login' });
    }
  },
  loader: async ({ context: { queryClient, trpc }, params }) => {
    await queryClient.ensureQueryData(
      trpc.dashboard.channels.getUploadRecord.queryOptions({
        channelId: params.channelId,
        uploadId: params.uploadId,
      }),
    );
    return {
      backNavigation: {
        label: 'Back to uploads',
        to: `/dashboard/channels/${params.channelId}/uploads`,
      },
    };
  },
});

// Progress bar for a processing step. At 0% the step is still queued, so we
// show an indeterminate (full, animated) bar and a "Queued" label; once it
// starts reporting progress we switch to a determinate bar with a percentage.
function ProcessingProgress({
  label,
  progress,
}: {
  label: string;
  progress: number;
}) {
  const queued = progress <= 0;
  return (
    <div>
      <Text size="sm" fw={500} className="mb-2.5">
        {label}
      </Text>
      <Progress value={queued ? 100 : progress * 100} size="lg" animated />
      <Text size="xs" c="dimmed" className="mt-2.5">
        {queued
          ? 'Queued'
          : `${Math.min(Math.round(progress * 100), 99)}% complete`}
      </Text>
    </div>
  );
}

// Debug-modal formatters. superjson deserializes timestamps back into Date
// objects, so these accept Date | null.
function fmtDate(d: Date | null | undefined) {
  return d ? d.toLocaleString() : '—';
}

function fmtDuration(
  start: Date | null | undefined,
  end: Date | null | undefined,
) {
  if (!start || !end) return '—';
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function fmtLength(sec: number | null | undefined) {
  if (sec == null) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m ${s % 60}s` : `${m}m ${s % 60}s`;
}

function fmtBytes(n: number | null | undefined) {
  return n == null ? '—' : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function ChannelUploadPage() {
  const { channelId, uploadId } = Route.useParams();
  // TanStack Router navigate — typed via the route's generated tree, used
  // both for the post-delete redirect and for the LLM-eval admin shortcut.
  const navigate = useNavigate();

  // Fully stop the preview <hls-video> on unmount. Custom-element media players
  // don't stop on disconnect, so navigating away mid-playback would leave a
  // detached element emitting audio. See stopMediaElement. A callback ref (that
  // only records non-null elements) is used instead of capture-at-mount because
  // the preview element mounts *late* — only once transcoding produces a source.
  const previewVideoRef = useRef<HlsVideoElement | null>(null);
  const setPreviewVideo = useCallback((el: HlsVideoElement | null) => {
    if (el) previewVideoRef.current = el;
  }, []);
  useEffect(() => () => stopMediaElement(previewVideoRef.current), []);
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  // Site-admin status comes from the session user's role, not channel
  // membership — a site admin who isn't a member of this channel still
  // needs the admin actions menu.
  const { data: currentUser } = useQuery(
    trpc.common.getCurrentUser.queryOptions(),
  );

  const { [uploadId]: uploadProgress } = useStore($uploadProgress, {
    keys: [uploadId],
  });
  const { [uploadId]: localVideoThumbnails } = useStore($localVideoThumbnails, {
    keys: [uploadId],
  });

  useEffect(() => retainLocalVideoThumbnails(uploadId), [uploadId]);

  const isUploading = typeof uploadProgress === 'number';

  // Single query for all upload data with conditional refetching
  const { data } = useSuspenseQuery({
    ...trpc.dashboard.channels.getUploadRecord.queryOptions({
      channelId,
      uploadId,
    }),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;

      const isTranscoding = !data.upload.transcodingFinishedAt;
      const isTranscribing = !data.upload.transcribingFinishedAt;
      const isGeneratingThumbnails =
        data.upload.mediaSource !== null &&
        !data.upload.generatedThumbnailsReady;

      return isTranscoding || isTranscribing || isGeneratingThumbnails
        ? 5000
        : false;
    },
  });

  const { upload, channel } = data;

  // Current processing status
  const isTranscoding = !isUploading && !upload.transcodingFinishedAt;
  const isTranscribing = !isUploading && !upload.transcribingFinishedAt;
  const isProcessing = isUploading || isTranscoding;

  // Site admins get the admin actions menu regardless of whether they're a
  // member of this channel, so derive it from the session user's role.
  const isSiteAdmin = currentUser?.role === 'ADMIN';

  // Permission logic matching the uploads list page
  const isChannelAdmin = channel.userMembership?.isAdmin ?? false;
  const isAdmin = isChannelAdmin || isSiteAdmin;
  const canDelete = isAdmin; // Only channel admins and site admins can delete
  // Matches the uploads list page: admins or members with download permission.
  const canDownload = isAdmin || (channel.userMembership?.canDownload ?? false);

  const isFailedUpload =
    upload.uploadFinalized &&
    upload.finalizedUploadKey &&
    (!upload.transcodingFinishedAt || !upload.transcribingFinishedAt) &&
    !upload.hasActiveWorkflow;

  const [newThumbnailFile, setNewThumbnailFile] = useState<File | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSpeakerModal, setShowSpeakerModal] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showReprocessModal, setShowReprocessModal] = useState(false);
  const [reprocessScope, setReprocessScope] = useState<
    'transcode' | 'transcribe' | 'everything'
  >('everything');
  const [reprocessSkipProbe, setReprocessSkipProbe] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedGeneratedThumbnailIndex, setSelectedGeneratedThumbnailIndex] =
    useState<number | null>(null);
  const [isProcessingThumbnail, setIsProcessingThumbnail] = useState(false);
  const [
    overrideThumbnailUrlBeforeUpload,
    setOverrideThumbnailUrlBeforeUpload,
  ] = useState<string | null>(null);
  // Copied-state for the embed-code copy button — flips back after a short delay.
  const { copied: embedCopied, copy: copyEmbed } = useCopied(1000);
  // Disable the LLM Eval menu item while the route transition is in
  // flight so a fast double-click can't fire `navigate` twice. The state
  // is only flipped back on navigate's rejection — the resolved case
  // unmounts this route, so the cleanup is implicit.
  const [navigatingToLlmEval, setNavigatingToLlmEval] = useState(false);

  // Series state variables
  const [seriesSearchValue, setSeriesSearchValue] = useState('');
  const [debouncedSeriesSearch] = useDebounce(seriesSearchValue, 200);
  const [showCreateSeriesModal, setShowCreateSeriesModal] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState('');

  // Track original series for comparison
  const originalSeriesId = upload.series?.id ?? null;

  // Series search query
  const { data: seriesSearchResults } = useQuery({
    ...trpc.dashboard.channels.searchChannelSeries.queryOptions({
      channelId,
      query: debouncedSeriesSearch,
    }),
    enabled: debouncedSeriesSearch.length >= 2,
  });

  // Get all series for the channel (for initial display)
  const { data: allChannelSeries = [] } = useQuery({
    ...trpc.dashboard.channels.getChannelPlaylists.queryOptions({
      channelId,
    }),
  });

  const resetDroppedThumbnail = useCallback(() => {
    setPreviewUrl((previewUrl) => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      return null;
    });
    setNewThumbnailFile(null);
    setSelectedGeneratedThumbnailIndex(null);
  }, []);

  // Poll for thumbnail changes when processing
  useEffect(() => {
    if (!isProcessingThumbnail) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        });

        const currentData = queryClient.getQueryData(
          trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        ) as typeof data;

        if (currentData) {
          const currentOverrideThumbnailUrl =
            currentData.upload.overrideThumbnailUrl;

          // The auto-generated default can appear while a new media upload is
          // still processing. Wait specifically for the override to change so
          // that event cannot be mistaken for the selected local frame.
          if (
            currentOverrideThumbnailUrl !== overrideThumbnailUrlBeforeUpload
          ) {
            setIsProcessingThumbnail(false);
            setOverrideThumbnailUrlBeforeUpload(null);
            showSuccess({
              title: 'Thumbnail Updated',
              message: 'Your thumbnail has been processed successfully!',
            });
          }
        }
      } catch (error) {
        console.error('Error polling for thumbnail changes:', error);
      }
    }, 1000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [
    isProcessingThumbnail,
    overrideThumbnailUrlBeforeUpload,
    queryClient,
    trpc,
    channelId,
    uploadId,
  ]);

  const updateMutation = useMutation(
    trpc.dashboard.channels.updateUploadRecord.mutationOptions({
      onSuccess: async () => {
        // Only show success message if not processing thumbnail
        // (thumbnail processing success will be shown by the polling effect)
        if (!isProcessingThumbnail) {
          showSuccess({
            message: 'Upload details updated successfully!',
          });
        }

        resetDroppedThumbnail();

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelUploads.queryKey({
            channelId,
          }),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to update upload details',
        });
      },
    }),
  );

  const setGeneratedThumbnailMutation = useMutation(
    trpc.dashboard.channels.setGeneratedThumbnail.mutationOptions(),
  );

  const downloadOriginalMutation = useMutation(
    trpc.dashboard.channels.getOriginalDownloadUrl.mutationOptions({
      onSuccess: ({ url }) => {
        window.open(url, '_blank');
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to get download URL',
        });
      },
    }),
  );

  const toggleFeaturedMutation = useMutation(
    trpc.dashboard.admin.toggleFeaturedUpload.mutationOptions({
      onSuccess: async ({ isFeatured }) => {
        showSuccess({
          message: isFeatured ? (
            <>
              Upload added to featured!{' '}
              <Anchor component={Link} to="/dashboard/admin/featured">
                View featured uploads
              </Anchor>
            </>
          ) : (
            'Upload removed from featured'
          ),
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelUploads.queryKey({
            channelId,
          }),
        });

        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.admin.getFeaturedUploads.queryKey(),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to toggle featured status',
        });
      },
    }),
  );

  const retryUploadMutation = useMutation(
    trpc.dashboard.admin.retryUploadProcessing.mutationOptions({
      onSuccess: async () => {
        showSuccess({
          message: 'Upload processing restarted successfully!',
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to retry upload processing',
        });
      },
    }),
  );

  // Reprocess this single upload through the media pipeline at a chosen
  // scope (site-admin only; opened from the admin actions menu modal).
  const reprocessUploadMutation = useMutation(
    trpc.dashboard.admin.reprocessUpload.mutationOptions({
      onSuccess: async () => {
        showSuccess({
          message: 'Reprocessing started. Refresh in a moment to see progress.',
        });
        setShowReprocessModal(false);
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to start reprocessing',
        });
      },
    }),
  );

  // Re-runs only the LLM summary chain for this upload (summarize + embed +
  // lc_media_v1 reindex). Cheap (~$0.005), no whisper involvement. Useful
  // after prompt changes for spot-fixing existing summaries without a full
  // reprocess.
  const regenerateSummaryMutation = useMutation(
    trpc.dashboard.admin.regenerateUploadSummary.mutationOptions({
      onSuccess: async () => {
        showSuccess({
          message:
            'Summary regeneration started. Refresh in a minute to see the new summary.',
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to regenerate summary',
        });
      },
    }),
  );

  // Same idea as regenerateSummaryMutation but for the annotation pipeline
  // (outline + scripture + keyword annotations + lc_media_v1 reindex).
  // Independent of summary so prompt-tuning loops on either side don't pay
  // for the other.
  const regenerateAnnotationsMutation = useMutation(
    trpc.dashboard.admin.regenerateUploadAnnotations.mutationOptions({
      onSuccess: async () => {
        showSuccess({
          message:
            'Annotation regeneration started. Refresh in a minute to see the new annotations.',
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to regenerate annotations',
        });
      },
    }),
  );

  const createSeriesMutation = useMutation(
    trpc.dashboard.channels.createPlaylist.mutationOptions({
      onSuccess: async (data) => {
        showSuccess({ message: 'Series created successfully' });
        // Select the newly created series and reflect its title in the combobox
        // input. The series won't be in the query-derived options until the
        // refetch below lands, and the input is a controlled `inputValue`, so we
        // set it explicitly here — otherwise the field is selected but the input
        // stays blank until the dropdown is reopened.
        form.setFieldValue('seriesId', data.playlist.id);
        setShowCreateSeriesModal(false);
        setNewSeriesTitle('');
        setSeriesSearchValue(data.playlist.title);

        // Invalidate queries to refresh data
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getUploadRecord.queryKey({
            channelId,
            uploadId,
          }),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.channels.getChannelPlaylists.queryKey({
            channelId,
          }),
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to create series',
        });
      },
    }),
  );

  const deleteUploadMutation = useMutation(
    trpc.dashboard.channels.deleteUploadRecord.mutationOptions({
      onSuccess: async ({ uploadId }) => {
        $deletedUploads.setKey(uploadId, true);
        showSuccess({ message: 'Upload deletion started successfully' });
        setShowDeleteModal(false);

        // Navigate back to the uploads list
        await navigate({
          to: `/dashboard/channels/${channelId}/uploads`,
        });
      },
      onError: (error) => {
        showFailure({
          message: error.message || 'Failed to delete upload',
        });
      },
    }),
  );

  const licenseOptions = [
    { value: 'STANDARD', label: 'Standard Copyright' },
    { value: 'PUBLIC_DOMAIN', label: 'Public Domain' },
    {
      group: 'Creative Commons',
      items: [
        { value: 'CC_BY', label: 'CC BY' },
        { value: 'CC_BY_SA', label: 'CC BY-SA' },
        { value: 'CC_BY_NC', label: 'CC BY-NC' },
        { value: 'CC_BY_NC_SA', label: 'CC BY-NC-SA' },
        { value: 'CC_BY_ND', label: 'CC BY-ND' },
        { value: 'CC_BY_NC_ND', label: 'CC BY-NC-ND' },
        { value: 'CC0', label: 'CC0' },
      ],
    },
  ];

  const form = useAppForm({
    defaultValues: {
      title: upload.title || '',
      description: upload.description || '',
      license: upload.license,
      publishedAt: new Date(upload.publishedAt),
      visibility: upload.visibility,
      userCommentsEnabled: upload.userCommentsEnabled,
      downloadsEnabled: upload.downloadsEnabled,
      seriesId: upload.series?.id ?? null,
    },
    validators: {
      onChange: uploadFormSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        if (newThumbnailFile) {
          setOverrideThumbnailUrlBeforeUpload(upload.overrideThumbnailUrl);

          const mpu =
            await trpcClient.dashboard.channels.createMultipartUpload.mutate({
              channelId,
              targetId: uploadId,
              uploadMimeType: newThumbnailFile.type,
              postProcess: 'thumbnail',
              bytes: newThumbnailFile.size,
            });

          const uploadPromise = doMultipartUpload(
            newThumbnailFile,
            mpu.urls,
            mpu.partSize,
          );

          await trpcClient.dashboard.channels.finalizeMultipartUpload.mutate({
            channelId,
            s3UploadKey: mpu.s3UploadKey,
            s3UploadId: mpu.s3UploadId,
            s3PartETags: await uploadPromise,
          });

          setIsProcessingThumbnail(true);
        } else if (selectedGeneratedThumbnailIndex !== null) {
          await setGeneratedThumbnailMutation.mutateAsync({
            channelId,
            uploadId,
            thumbnailIndex: selectedGeneratedThumbnailIndex,
          });
        }

        // Update basic upload fields
        await updateMutation.mutateAsync({
          channelId,
          uploadId,
          ...value,
        });

        // Handle series change
        const newSeriesId = value.seriesId ?? null;
        if (newSeriesId !== originalSeriesId) {
          try {
            if (originalSeriesId) {
              await trpcClient.dashboard.channels.removeFromPlaylist.mutate({
                channelId,
                playlistId: originalSeriesId,
                uploadId,
              });
            }
            if (newSeriesId) {
              await trpcClient.dashboard.channels.addToPlaylist.mutate({
                channelId,
                playlistId: newSeriesId,
                uploadId,
              });
            }
          } finally {
            await queryClient.invalidateQueries({
              queryKey: trpc.dashboard.channels.getUploadRecord.queryKey({
                channelId,
                uploadId,
              }),
            });
          }
        }
      } catch (error) {
        showFailure({
          message:
            error instanceof Error ? error.message : 'Failed to update upload',
        });
      }
    },
  });

  // Build Select data for single-series picker
  const seriesSelectData = useMemo(() => {
    const seriesMap = new Map<string, { id: string; title: string }>();

    for (const s of allChannelSeries) {
      if (s.type === 'SERIES') seriesMap.set(s.id, s);
    }
    for (const s of seriesSearchResults ?? []) seriesMap.set(s.id, s);
    if (upload.series && !seriesMap.has(upload.series.id)) {
      seriesMap.set(upload.series.id, upload.series);
    }

    const options = Array.from(seriesMap.values()).map((s) => ({
      value: s.id,
      label: s.title,
    }));

    if (debouncedSeriesSearch.trim().length >= 2) {
      const hasExactMatch = options.some(
        (opt) =>
          opt.label.toLowerCase() === debouncedSeriesSearch.toLowerCase(),
      );
      if (!hasExactMatch) {
        options.unshift({
          value: '__CREATE__',
          label: `+ Create new series: "${debouncedSeriesSearch}"`,
        });
      }
    }

    return options;
  }, [
    allChannelSeries,
    seriesSearchResults,
    upload.series,
    debouncedSeriesSearch,
  ]);

  // The iframe embed snippet — computed once and reused by both the copy
  // button and the read-only textarea below.
  const embedCode = `<iframe src="${typeof window !== 'undefined' ? window.location.origin : 'https://lets.church'}/embed/media/${idTranslator.fromUUID(uploadId)}" width="1920" height="1080" frameborder="0" allowfullscreen allow="fullscreen; picture-in-picture"></iframe>`;
  const selectedGeneratedThumbnail = upload.generatedThumbnails.find(
    (thumbnail) => thumbnail.index === selectedGeneratedThumbnailIndex,
  );
  const thumbnailPreviewUrl =
    previewUrl ?? selectedGeneratedThumbnail?.url ?? upload.thumbnailUrl;

  return (
    <div className="relative w-full">
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => <LoadingOverlay visible={isSubmitting} />}
      </form.Subscribe>

      {/* Private Upload Warning Banner */}
      <form.Subscribe selector={(state) => state.values.visibility}>
        {(visibility) =>
          visibility === 'PRIVATE' ? (
            <Alert
              variant="light"
              color="yellow"
              title="Private Upload"
              icon={<IconEyeOff size={16} />}
              className="mb-5"
            >
              This upload is currently private and only visible to members of{' '}
              {channel.name}. To make it viewable to everyone, change the
              visibility setting to "Public" below.
            </Alert>
          ) : null
        }
      </form.Subscribe>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
        <div className="md:col-span-8">
          <div className="flex flex-col gap-5">
            <Title order={1}>Upload details</Title>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <div className="flex flex-col gap-4">
                <form.AppField name="title">
                  {(field) => (
                    <field.TextInputField
                      label="Title"
                      placeholder="Add a title that describes your upload"
                    />
                  )}
                </form.AppField>

                <form.AppField name="description">
                  {(field) => (
                    <field.TextareaField
                      label="Description"
                      placeholder="Tell viewers about your upload"
                      minRows={4}
                      maxRows={8}
                      autosize
                    />
                  )}
                </form.AppField>

                <div>
                  <Text fw={500} size="sm" className="mb-2.5">
                    Thumbnail
                  </Text>
                  <div className="flex flex-wrap items-center justify-start gap-4">
                    <Tooltip
                      label="Click or drop image to change thumbnail"
                      position="bottom"
                    >
                      <div
                        className="relative"
                        style={{ width: 320, height: 180 }}
                      >
                        <Dropzone
                          onDrop={(files) => {
                            const file = files[0];
                            if (file) {
                              setSelectedGeneratedThumbnailIndex(null);
                              if (previewUrl) {
                                URL.revokeObjectURL(previewUrl);
                              }
                              const url = URL.createObjectURL(file);
                              setPreviewUrl(url);
                              setNewThumbnailFile(file);
                            }
                          }}
                          accept={['image/*']}
                          disabled={isProcessingThumbnail}
                          style={{
                            borderRadius: 4,
                            padding: 0,
                            border: 'none',
                            overflow: 'hidden',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            if (!isProcessingThumbnail) {
                              const overlay = e.currentTarget.querySelector(
                                '.dropzone-overlay',
                              ) as HTMLElement;
                              if (overlay) overlay.style.opacity = '1';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isProcessingThumbnail) {
                              const overlay = e.currentTarget.querySelector(
                                '.dropzone-overlay',
                              ) as HTMLElement;
                              if (overlay) overlay.style.opacity = '0';
                            }
                          }}
                          className="h-[180px] w-[320px]"
                        >
                          <div className="relative h-full w-full">
                            {thumbnailPreviewUrl ? (
                              <img
                                src={thumbnailPreviewUrl}
                                alt="Upload thumbnail"
                                className="h-full w-full"
                                style={{ objectFit: 'cover' }}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-zinc-800">
                                <IconPhoto
                                  size={32}
                                  stroke={1.5}
                                  color="#adb5bd"
                                />
                              </div>
                            )}

                            <div
                              className="dropzone-overlay absolute inset-0 flex items-center justify-center"
                              style={{
                                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                opacity: isProcessingThumbnail ? 1 : 0,
                                transition: 'opacity 0.2s ease',
                                pointerEvents: 'none',
                              }}
                            >
                              {isProcessingThumbnail ? (
                                <div className="flex h-full w-full items-center justify-center">
                                  <Loader size="md" color="white" />
                                </div>
                              ) : (
                                <>
                                  <Dropzone.Accept>
                                    <IconUpload
                                      size={32}
                                      stroke={1.5}
                                      color="white"
                                    />
                                  </Dropzone.Accept>
                                  <Dropzone.Reject>
                                    <IconX
                                      size={32}
                                      stroke={1.5}
                                      color="white"
                                    />
                                  </Dropzone.Reject>
                                  <Dropzone.Idle>
                                    <IconUpload
                                      size={32}
                                      stroke={1.5}
                                      color="white"
                                    />
                                  </Dropzone.Idle>
                                </>
                              )}
                            </div>
                          </div>
                        </Dropzone>

                        {(newThumbnailFile ||
                          selectedGeneratedThumbnailIndex !== null) && (
                          <ActionIcon
                            className="absolute"
                            style={{ top: 4, right: 4, zIndex: 10 }}
                            size="sm"
                            variant="filled"
                            color="dark"
                            onClick={resetDroppedThumbnail}
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        )}

                        {(previewUrl || selectedGeneratedThumbnail) &&
                          !isProcessingThumbnail && (
                            <Text
                              size="xs"
                              c="dimmed"
                              style={{ textAlign: 'center' }}
                              className="mt-[4px]"
                            >
                              {previewUrl
                                ? 'New uploaded thumbnail'
                                : 'Generated thumbnail selected'}
                            </Text>
                          )}
                      </div>
                    </Tooltip>
                  </div>

                  {localVideoThumbnails ? (
                    <div className="mt-7">
                      <Text fw={500} size="sm">
                        Frames from your video
                      </Text>
                      <Text size="xs" c="dimmed" className="mt-1">
                        Pick a frame from the file you just uploaded.
                      </Text>

                      {localVideoThumbnails.status === 'loading' ? (
                        <div className="flex items-center gap-3 py-5">
                          <Loader size="sm" />
                          <Text size="sm" c="dimmed">
                            Preparing thumbnail candidates…
                          </Text>
                        </div>
                      ) : localVideoThumbnails.status === 'error' ? (
                        <Text size="sm" c="red" className="mt-3">
                          {localVideoThumbnails.message}
                        </Text>
                      ) : (
                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {localVideoThumbnails.candidates.map(
                            (candidate, index) => {
                              const isSelected =
                                newThumbnailFile === candidate.file;

                              return (
                                <button
                                  key={`${candidate.timeSeconds}-${index}`}
                                  type="button"
                                  aria-label={`Use frame at ${formatTime(candidate.timeSeconds * 1000)}`}
                                  aria-pressed={isSelected}
                                  disabled={isProcessingThumbnail}
                                  onClick={() => {
                                    resetDroppedThumbnail();
                                    setPreviewUrl(
                                      URL.createObjectURL(candidate.file),
                                    );
                                    setNewThumbnailFile(candidate.file);
                                  }}
                                  className={cn(
                                    'relative aspect-video overflow-hidden rounded-lg border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                    isSelected
                                      ? 'border-brand'
                                      : 'border-transparent hover:border-gray-300 dark:hover:border-zinc-600',
                                  )}
                                >
                                  <img
                                    src={candidate.url}
                                    alt=""
                                    className="size-full object-cover"
                                  />
                                  <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1.5 py-0.5 text-xs text-white">
                                    {formatTime(candidate.timeSeconds * 1000)}
                                  </span>
                                  {isSelected ? (
                                    <span className="bg-brand absolute top-2 right-2 flex size-5 items-center justify-center rounded-full text-white">
                                      <IconCheck size={13} />
                                    </span>
                                  ) : null}
                                </button>
                              );
                            },
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {upload.generatedThumbnails.length > 0 ? (
                    <Accordion.Root className="mt-7">
                      <Accordion.Item
                        value="generated-thumbnails"
                        className="overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-700"
                      >
                        <Accordion.Header>
                          <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-zinc-800">
                            <div>
                              <Text fw={500} size="sm">
                                Generated thumbnails
                              </Text>
                              <Text size="xs" c="dimmed" className="mt-1">
                                {upload.generatedThumbnails.length} frames from
                                processing
                              </Text>
                            </div>
                            <IconChevronDown
                              aria-hidden
                              size={18}
                              className="shrink-0 transition-transform group-data-[panel-open]:rotate-180"
                            />
                          </Accordion.Trigger>
                        </Accordion.Header>
                        <Accordion.Panel>
                          <div className="border-t border-gray-200 p-4 dark:border-zinc-700">
                            <Text size="xs" c="dimmed" className="mb-3">
                              Choose any frame created while this video was
                              processed, or upload your own image above.
                            </Text>
                            <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                              {upload.generatedThumbnails.map((thumbnail) => {
                                const isSelected =
                                  selectedGeneratedThumbnailIndex ===
                                    thumbnail.index ||
                                  (selectedGeneratedThumbnailIndex === null &&
                                    !newThumbnailFile &&
                                    thumbnail.isSelected);

                                return (
                                  <button
                                    key={thumbnail.index}
                                    type="button"
                                    aria-label={`Use generated thumbnail ${thumbnail.index}`}
                                    aria-pressed={isSelected}
                                    disabled={isProcessingThumbnail}
                                    onClick={() => {
                                      resetDroppedThumbnail();
                                      setSelectedGeneratedThumbnailIndex(
                                        thumbnail.index,
                                      );
                                    }}
                                    className={cn(
                                      'relative aspect-video overflow-hidden rounded-lg border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                      isSelected
                                        ? 'border-brand'
                                        : 'border-transparent hover:border-gray-300 dark:hover:border-zinc-600',
                                    )}
                                  >
                                    <img
                                      src={thumbnail.url}
                                      alt=""
                                      loading="lazy"
                                      className="size-full object-cover"
                                    />
                                    {isSelected ? (
                                      <span className="bg-brand absolute top-2 right-2 flex size-5 items-center justify-center rounded-full text-white">
                                        <IconCheck size={13} />
                                      </span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </Accordion.Panel>
                      </Accordion.Item>
                    </Accordion.Root>
                  ) : null}
                </div>

                <form.AppField name="license">
                  {(field) => (
                    <field.SelectField label="License" data={licenseOptions} />
                  )}
                </form.AppField>

                <form.AppField name="publishedAt">
                  {(field) => (
                    <field.DatePickerField
                      label="Published Date"
                      valueFormat="MM/DD/YYYY"
                      firstDayOfWeek={0}
                      weekendDays={[0, 6]}
                    />
                  )}
                </form.AppField>

                {/* Series Selection */}
                <form.AppField name="seriesId">
                  {(field) => {
                    const selectedSeriesOption =
                      seriesSelectData.find(
                        (opt) => opt.value === field.state.value,
                      ) ?? null;
                    return (
                      <InputWrapper
                        label="Series"
                        description="Add this upload to a series in your channel"
                      >
                        <Combobox.Root
                          items={seriesSelectData}
                          value={selectedSeriesOption}
                          onValueChange={(value) => {
                            if (!value) {
                              field.handleChange(null);
                              return;
                            }
                            if (value.value === '__CREATE__') {
                              setNewSeriesTitle(debouncedSeriesSearch);
                              setSeriesSearchValue('');
                              setShowCreateSeriesModal(true);
                            } else {
                              field.handleChange(value.value);
                            }
                          }}
                          inputValue={seriesSearchValue}
                          onInputValueChange={(value) =>
                            setSeriesSearchValue(value)
                          }
                          filter={null}
                        >
                          <div className="relative">
                            <Combobox.Input
                              placeholder="Search and select a series..."
                              className={cn(controlClasses(), 'pr-8')}
                            />
                            <Combobox.Clear
                              aria-label="Clear series"
                              className="text-muted hover:text-primary absolute inset-y-0 right-0 flex items-center pr-2"
                            >
                              <IconX size={16} />
                            </Combobox.Clear>
                          </div>
                          <Combobox.Portal>
                            <Combobox.Positioner
                              side="bottom"
                              sideOffset={4}
                              className="z-50"
                            >
                              <Combobox.Popup className="border-fancy-pants max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-lg bg-white p-1 shadow-lg dark:bg-zinc-900">
                                <Combobox.Empty className="text-secondary px-3 py-2 text-sm empty:hidden">
                                  {debouncedSeriesSearch.length < 2
                                    ? 'Type to search series...'
                                    : 'No series found'}
                                </Combobox.Empty>
                                <Combobox.List>
                                  {(item: { value: string; label: string }) => (
                                    <Combobox.Item
                                      key={item.value}
                                      value={item}
                                      className="text-primary data-[highlighted]:bg-brand/10 flex cursor-default items-center justify-between rounded px-3 py-1.5 text-sm"
                                    >
                                      {item.label}
                                      <Combobox.ItemIndicator>
                                        <IconCheck
                                          size={14}
                                          className="text-brand"
                                        />
                                      </Combobox.ItemIndicator>
                                    </Combobox.Item>
                                  )}
                                </Combobox.List>
                              </Combobox.Popup>
                            </Combobox.Positioner>
                          </Combobox.Portal>
                        </Combobox.Root>
                      </InputWrapper>
                    );
                  }}
                </form.AppField>
              </div>
            </form>
          </div>
        </div>

        <div className="md:col-span-4">
          <div className="flex flex-col gap-5">
            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-start gap-3">
              <form.Subscribe
                selector={(state) => ({
                  isDirty: state.isDirty,
                  isValid: state.isValid,
                })}
              >
                {({ isDirty, isValid }) => (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={
                        !isDirty &&
                        !newThumbnailFile &&
                        selectedGeneratedThumbnailIndex === null
                      }
                      onClick={() => {
                        form.reset();
                        resetDroppedThumbnail();
                        setSeriesSearchValue('');
                      }}
                    >
                      Undo changes
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={
                        (!isDirty &&
                          !newThumbnailFile &&
                          selectedGeneratedThumbnailIndex === null) ||
                        !isValid
                      }
                      loading={
                        updateMutation.isPending ||
                        setGeneratedThumbnailMutation.isPending
                      }
                      onClick={() => form.handleSubmit()}
                    >
                      Save
                    </Button>
                  </>
                )}
              </form.Subscribe>
            </div>

            {/* View Media Page Button */}
            <Button
              component={Link}
              to={`/media/${idTranslator.fromUUID(uploadId)}`}
              variant="light"
              leftSection={<IconEye size={16} />}
              fullWidth
              disabled={isProcessing}
            >
              View Media Page
            </Button>

            {/* Label speakers — available to admins once a transcript exists. */}
            {isAdmin && upload.transcribingFinishedAt ? (
              <Button
                variant="light"
                leftSection={<IconUsers size={16} />}
                fullWidth
                onClick={() => setShowSpeakerModal(true)}
              >
                Label Speakers
              </Button>
            ) : null}

            {/* Download the original uploaded file — same permission as the
                uploads list (admins or members with download permission). */}
            {canDownload && upload.finalizedUploadKey ? (
              <Button
                variant="light"
                leftSection={<IconDownload size={16} />}
                fullWidth
                loading={downloadOriginalMutation.isPending}
                onClick={() =>
                  downloadOriginalMutation.mutate({ channelId, uploadId })
                }
              >
                Download Original
              </Button>
            ) : null}

            {/* Site admins get the full admin actions menu; channel admins
                (without site-admin scope) get only a delete button. */}
            {isSiteAdmin ? (
              <LcMenu.Root>
                <LcMenu.Trigger
                  render={
                    <Button
                      variant="light"
                      color="gray"
                      rightSection={<IconChevronDown size={14} />}
                      fullWidth
                    >
                      Admin actions
                    </Button>
                  }
                />
                <LcMenu.Portal>
                  <LcMenu.Positioner
                    align="end"
                    sideOffset={4}
                    className="w-[var(--anchor-width)]"
                  >
                    <LcMenu.Popup>
                      <MenuItemButton
                        icon={<IconBug size={16} />}
                        onClick={() => setShowDebugModal(true)}
                      >
                        Debug Info
                      </MenuItemButton>

                      <LcMenu.Item
                        render={(props) => (
                          <button
                            {...props}
                            type="button"
                            disabled={
                              isProcessing || reprocessUploadMutation.isPending
                            }
                            onClick={() => setShowReprocessModal(true)}
                            className="text-primary flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                          >
                            {reprocessUploadMutation.isPending ? (
                              <Loader size={14} />
                            ) : (
                              <IconReload size={16} />
                            )}
                            Reprocess
                          </button>
                        )}
                      />

                      <LcMenu.Item
                        render={(props) => (
                          <button
                            {...props}
                            type="button"
                            disabled={
                              isProcessing || toggleFeaturedMutation.isPending
                            }
                            onClick={() => {
                              toggleFeaturedMutation.mutate({ uploadId });
                            }}
                            className="text-primary flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                          >
                            {toggleFeaturedMutation.isPending ? (
                              <Loader size={14} />
                            ) : upload.isFeatured ? (
                              <IconStarFilled size={16} />
                            ) : (
                              <IconStar size={16} />
                            )}
                            {upload.isFeatured
                              ? 'Remove from Featured'
                              : 'Feature'}
                          </button>
                        )}
                      />

                      {isFailedUpload ? (
                        <LcMenu.Item
                          render={(props) => (
                            <button
                              {...props}
                              type="button"
                              disabled={retryUploadMutation.isPending}
                              onClick={() => {
                                retryUploadMutation.mutate({
                                  uploadRecordId: uploadId,
                                });
                              }}
                              className="text-primary flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                            >
                              {retryUploadMutation.isPending ? (
                                <Loader size={14} />
                              ) : (
                                <IconRefresh size={16} />
                              )}
                              Retry Processing
                            </button>
                          )}
                        />
                      ) : null}

                      {/* Summary / annotation regen + LLM eval depend on
                          paragraphs from transcribe. Server-side guards
                          also reject legacy uploads with no paragraphs. */}
                      {upload.transcribingFinishedAt ? (
                        <>
                          <LcMenu.Item
                            render={(props) => (
                              <button
                                {...props}
                                type="button"
                                disabled={regenerateSummaryMutation.isPending}
                                onClick={() => {
                                  regenerateSummaryMutation.mutate({
                                    uploadRecordId: uploadId,
                                  });
                                }}
                                className="text-primary flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                              >
                                {regenerateSummaryMutation.isPending ? (
                                  <Loader size={14} />
                                ) : (
                                  <IconSparkles size={16} />
                                )}
                                Regenerate Summary
                              </button>
                            )}
                          />

                          <LcMenu.Item
                            render={(props) => (
                              <button
                                {...props}
                                type="button"
                                disabled={
                                  regenerateAnnotationsMutation.isPending
                                }
                                onClick={() => {
                                  regenerateAnnotationsMutation.mutate({
                                    uploadRecordId: uploadId,
                                  });
                                }}
                                className="text-primary flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                              >
                                {regenerateAnnotationsMutation.isPending ? (
                                  <Loader size={14} />
                                ) : (
                                  <IconSparkles size={16} />
                                )}
                                Regenerate Annotations
                              </button>
                            )}
                          />

                          <LcMenu.Item
                            render={(props) => (
                              <button
                                {...props}
                                type="button"
                                disabled={navigatingToLlmEval}
                                onClick={() => {
                                  // Mantine's polymorphic <Menu.Item
                                  // component={Link}> loses TanStack Router's
                                  // typed-route generic, so the typed-search
                                  // prop can't be passed that way. Plain
                                  // navigate() keeps the search typed.
                                  setNavigatingToLlmEval(true);
                                  navigate({
                                    to: '/dashboard/admin/llm-eval',
                                    search: {
                                      uploadId,
                                      task: 'annotate',
                                      models: 'openai/gpt-5.6-luna',
                                    },
                                  }).catch(() => {
                                    // Resolved case unmounts this route; this
                                    // branch only fires if navigation rejects
                                    // (e.g. beforeLoad guard redirect) and we
                                    // stay mounted — clear the spinner so the
                                    // item is clickable again.
                                    setNavigatingToLlmEval(false);
                                  });
                                }}
                                className="text-primary flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-zinc-800"
                              >
                                {navigatingToLlmEval ? (
                                  <Loader size={14} />
                                ) : (
                                  <IconFlask size={16} />
                                )}
                                LLM Eval
                              </button>
                            )}
                          />
                        </>
                      ) : null}
                    </LcMenu.Popup>
                  </LcMenu.Positioner>
                </LcMenu.Portal>
              </LcMenu.Root>
            ) : null}

            {/* Delete stands on its own for anyone who can delete (channel
                admins and site admins); the menu above is site-admin only. */}
            {canDelete ? (
              <Button
                color="red"
                variant="light"
                leftSection={<IconTrash size={16} />}
                fullWidth
                onClick={() => setShowDeleteModal(true)}
              >
                Delete Upload
              </Button>
            ) : null}

            {/* Player or Progress Bars */}
            <div className="flex flex-col gap-4">
              {/* Show upload/transcoding progress if still processing */}
              {isProcessing ? (
                <>
                  {/* Upload Progress */}
                  {isUploading ? (
                    <div>
                      <Text size="sm" fw={500} className="mb-2.5">
                        Uploading file...
                      </Text>
                      <Progress
                        value={uploadProgress * 100}
                        size="lg"
                        animated
                      />
                      <Text size="xs" c="dimmed" className="mt-2.5">
                        {Math.min(Math.round(uploadProgress * 100), 99)}%
                        uploaded
                      </Text>
                    </div>
                  ) : null}

                  {/* Transcoding Progress - show when not uploading */}
                  {isTranscoding ? (
                    <ProcessingProgress
                      label="Transcoding media..."
                      progress={upload.transcodingProgress}
                    />
                  ) : null}
                </>
              ) : upload.mediaSource ? (
                <HlsVideo
                  ref={setPreviewVideo}
                  src={upload.mediaSource}
                  className="w-full"
                  playsInline
                  controls
                />
              ) : upload.audioSource ? (
                <HlsVideo
                  ref={setPreviewVideo}
                  src={upload.audioSource}
                  className="w-full"
                  controls
                  style={{ height: '54px' }}
                />
              ) : (
                <div
                  className="bg-gray-100 p-4 dark:bg-zinc-800"
                  style={{
                    borderRadius: '4px',
                    textAlign: 'center',
                  }}
                >
                  <Text size="sm" c="dimmed">
                    No media available for playback
                  </Text>
                </div>
              )}

              {/* Transcribing Progress - show when not uploading (even alongside player) */}
              {isTranscribing ? (
                <ProcessingProgress
                  label="Transcribing audio..."
                  progress={upload.transcribingProgress}
                />
              ) : null}
            </div>

            {/* Visibility Settings */}
            <div className="flex flex-col gap-4">
              <Text fw={500} size="sm">
                Visibility
              </Text>
              <form.AppField name="visibility">
                {(field) => (
                  <field.RadioGroupField>
                    <div className="flex flex-col gap-3">
                      <Radio
                        value="PUBLIC"
                        label={
                          <div>
                            <Text fw={500}>Public</Text>
                            <Text size="xs" c="dimmed">
                              Visible to everyone
                            </Text>
                          </div>
                        }
                      />
                      <Radio
                        value="PRIVATE"
                        label={
                          <div>
                            <Text fw={500}>Private</Text>
                            <Text size="xs" c="dimmed">
                              Visible only to members of {channel.name}
                            </Text>
                          </div>
                        }
                      />
                      <Radio
                        value="UNLISTED"
                        label={
                          <div>
                            <Text fw={500}>Unlisted</Text>
                            <Text size="xs" c="dimmed">
                              Visible everyone with a link
                            </Text>
                          </div>
                        }
                      />
                    </div>
                  </field.RadioGroupField>
                )}
              </form.AppField>
            </div>

            {/* Comments Settings */}
            <div className="flex flex-col gap-4">
              <Text fw={500} size="sm">
                Comments
              </Text>
              <form.AppField name="userCommentsEnabled">
                {(field) => (
                  <Radio.Group
                    value={field.state.value ? 'ENABLED' : 'DISABLED'}
                    onChange={(value) =>
                      field.handleChange(value === 'ENABLED')
                    }
                  >
                    <div className="flex flex-col gap-3">
                      <Radio
                        value="ENABLED"
                        label={
                          <div>
                            <Text fw={500}>Enabled</Text>
                            <Text size="xs" c="dimmed">
                              Users can comment on this upload.
                            </Text>
                          </div>
                        }
                      />
                      <Radio
                        value="DISABLED"
                        label={
                          <div>
                            <Text fw={500}>Disabled</Text>
                            <Text size="xs" c="dimmed">
                              Users cannot comment on this upload.
                            </Text>
                          </div>
                        }
                      />
                    </div>
                  </Radio.Group>
                )}
              </form.AppField>
            </div>

            {/* Downloads Settings */}
            <div className="flex flex-col gap-4">
              <Text fw={500} size="sm">
                Downloads
              </Text>
              <form.AppField name="downloadsEnabled">
                {(field) => (
                  <Radio.Group
                    value={field.state.value ? 'ENABLED' : 'DISABLED'}
                    onChange={(value) =>
                      field.handleChange(value === 'ENABLED')
                    }
                  >
                    <div className="flex flex-col gap-3">
                      <Radio
                        value="ENABLED"
                        label={
                          <div>
                            <Text fw={500}>Enabled</Text>
                            <Text size="xs" c="dimmed">
                              Users can download this media.
                            </Text>
                          </div>
                        }
                      />
                      <Radio
                        value="DISABLED"
                        label={
                          <div>
                            <Text fw={500}>Disabled</Text>
                            <Text size="xs" c="dimmed">
                              Users cannot download this media.
                            </Text>
                          </div>
                        }
                      />
                    </div>
                  </Radio.Group>
                )}
              </form.AppField>
            </div>

            {/* Embed Code */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <Text fw={500} size="sm">
                  Embed Code
                </Text>
                <Tooltip label={embedCopied ? 'Copied!' : 'Copy embed code'}>
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={
                      embedCopied ? (
                        <IconCheck size={14} />
                      ) : (
                        <IconCopy size={14} />
                      )
                    }
                    onClick={() => copyEmbed(embedCode)}
                    color={embedCopied ? 'green' : undefined}
                  >
                    {embedCopied ? 'Copied' : 'Copy'}
                  </Button>
                </Tooltip>
              </div>
              <Textarea
                readOnly
                value={embedCode}
                autosize
                minRows={3}
                maxRows={5}
                className="font-mono text-xs"
              />
              <Text size="xs" c="dimmed">
                Use this code to embed the media player on external websites.
              </Text>
            </div>
          </div>
        </div>
      </div>

      {/* Site-admin debug modal */}
      <LcModal.Root
        open={showDebugModal}
        onOpenChange={(o) => {
          if (!o) setShowDebugModal(false);
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="lg">
            <ModalHeader title="Upload debug info" />
            {upload.debug ? (
              <Table withRowBorders={false}>
                <Table.Tbody>
                  {(
                    [
                      ['Upload ID', uploadId],
                      ['Encoder', upload.debug.transcodeEncoder ?? 'unknown'],
                      [
                        'Pipeline version',
                        String(upload.debug.pipelineVersion),
                      ],
                      ['Variants', upload.debug.variants.join(', ') || '—'],
                      [
                        'Transcode started',
                        fmtDate(upload.debug.transcodingStartedAt),
                      ],
                      [
                        'Transcode finished',
                        fmtDate(upload.debug.transcodingFinishedAt),
                      ],
                      [
                        'Transcode duration',
                        fmtDuration(
                          upload.debug.transcodingStartedAt,
                          upload.debug.transcodingFinishedAt,
                        ),
                      ],
                      [
                        'Transcribe started',
                        fmtDate(upload.debug.transcribingStartedAt),
                      ],
                      [
                        'Transcribe finished',
                        fmtDate(upload.debug.transcribingFinishedAt),
                      ],
                      [
                        'Transcribe duration',
                        fmtDuration(
                          upload.debug.transcribingStartedAt,
                          upload.debug.transcribingFinishedAt,
                        ),
                      ],
                      ['Length', fmtLength(upload.debug.lengthSeconds)],
                      ['Size', fmtBytes(upload.debug.uploadSizeBytes)],
                      ['Original file', upload.debug.originalFileName ?? '—'],
                      ['Created', fmtDate(upload.debug.createdAt)],
                      ['Updated', fmtDate(upload.debug.updatedAt)],
                      ['Finalized key', upload.debug.finalizedUploadKey ?? '—'],
                    ] as const
                  ).map(([label, value]) => (
                    <Table.Tr key={label}>
                      <Table.Td
                        style={{
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          verticalAlign: 'top',
                        }}
                      >
                        {label}
                      </Table.Td>
                      <Table.Td
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 12,
                          wordBreak: 'break-all',
                        }}
                      >
                        {value}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text c="dimmed">No debug info available.</Text>
            )}
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      {/* Reprocess Modal (site admin) */}
      <LcModal.Root
        open={showReprocessModal}
        onOpenChange={(o) => {
          if (!o) setShowReprocessModal(false);
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Reprocess upload" />
            <div className="flex flex-col gap-4">
              <Text size="sm" c="dimmed">
                Re-run this upload through the media pipeline. Choose which
                stages to reprocess.
              </Text>
              <ToggleGroup
                value={[reprocessScope]}
                onValueChange={(value) => {
                  if (value[0]) {
                    setReprocessScope(
                      value[0] as 'transcode' | 'transcribe' | 'everything',
                    );
                  }
                }}
                className="grid w-full grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-zinc-800"
              >
                <Toggle
                  value="transcode"
                  className="text-primary rounded-md px-3 py-1.5 text-center text-sm transition-colors data-[pressed]:bg-white data-[pressed]:shadow-sm dark:data-[pressed]:bg-zinc-900"
                >
                  Transcode
                </Toggle>
                <Toggle
                  value="transcribe"
                  className="text-primary rounded-md px-3 py-1.5 text-center text-sm transition-colors data-[pressed]:bg-white data-[pressed]:shadow-sm dark:data-[pressed]:bg-zinc-900"
                >
                  Transcribe
                </Toggle>
                <Toggle
                  value="everything"
                  className="text-primary rounded-md px-3 py-1.5 text-center text-sm transition-colors data-[pressed]:bg-white data-[pressed]:shadow-sm dark:data-[pressed]:bg-zinc-900"
                >
                  Everything
                </Toggle>
              </ToggleGroup>
              <Checkbox
                label="Skip probe (reuse stored metadata)"
                checked={reprocessSkipProbe}
                onChange={(checked) => setReprocessSkipProbe(checked)}
              />
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                  variant="default"
                  onClick={() => setShowReprocessModal(false)}
                  disabled={reprocessUploadMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    reprocessUploadMutation.mutate({
                      uploadRecordId: uploadId,
                      processingScope: reprocessScope,
                      skipProbe: reprocessSkipProbe,
                    })
                  }
                  loading={reprocessUploadMutation.isPending}
                >
                  Start reprocessing
                </Button>
              </div>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      {/* Delete Confirmation Modal */}
      <LcModal.Root
        open={showDeleteModal}
        onOpenChange={(o) => {
          if (!o) setShowDeleteModal(false);
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Confirm Delete" />
            <div className="flex flex-col gap-4">
              <Text>
                Are you sure you want to delete the upload "
                {upload.title || 'Untitled Upload'}"?
              </Text>
              <Text size="sm" c="dimmed">
                This action cannot be undone. The upload will be permanently
                removed from all storage systems.
              </Text>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                  variant="default"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleteUploadMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  color="red"
                  onClick={() => {
                    deleteUploadMutation.mutate({
                      channelId,
                      uploadId,
                    });
                  }}
                  loading={deleteUploadMutation.isPending}
                >
                  Delete Upload
                </Button>
              </div>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      {/* Create Series Modal */}
      <LcModal.Root
        open={showCreateSeriesModal}
        onOpenChange={(o) => {
          if (!o) {
            setShowCreateSeriesModal(false);
            setNewSeriesTitle('');
            setSeriesSearchValue('');
          }
        }}
      >
        <LcModal.Portal>
          <LcModal.Backdrop />
          <LcModal.Popup size="md">
            <ModalHeader title="Create New Series" />
            <div className="flex flex-col gap-4">
              <TextInput
                label="Series Title"
                value={newSeriesTitle}
                onChange={(e) => setNewSeriesTitle(e.currentTarget.value)}
                placeholder="Enter series title"
                autoFocus
                required
              />
              <Text size="sm" c="dimmed">
                The upload will be added to this series when you click Save.
              </Text>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                  variant="default"
                  onClick={() => {
                    setShowCreateSeriesModal(false);
                    setNewSeriesTitle('');
                    setSeriesSearchValue('');
                  }}
                  disabled={createSeriesMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    createSeriesMutation.mutate({
                      channelId,
                      title: newSeriesTitle.trim(),
                      type: 'SERIES',
                    });
                  }}
                  loading={createSeriesMutation.isPending}
                  disabled={newSeriesTitle.trim().length === 0}
                >
                  Create Series
                </Button>
              </div>
            </div>
          </LcModal.Popup>
        </LcModal.Portal>
      </LcModal.Root>

      {/* Speaker labeling modal */}
      <SpeakerLabelingModal
        opened={showSpeakerModal}
        onClose={() => setShowSpeakerModal(false)}
        channelId={channelId}
        uploadId={uploadId}
      />
    </div>
  );
}
