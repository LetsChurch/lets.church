import { Autocomplete, Loader } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { array, looseObject, string } from 'zod';
import { showFailure } from '@/routes/-mantine';
import { useTRPC } from '@/trpc/react';

const suggestionSchema = looseObject({
  name: string(),
  feature_type: string(),
  address: string().optional(),
  full_address: string().optional(),
  place_formatted: string(),
  mapbox_id: string(),
  context: looseObject({
    country: looseObject({ name: string() }).optional(),
    region: looseObject({ name: string(), region_code: string() }).optional(),
    postcode: looseObject({ name: string() }).optional(),
    place: looseObject({ name: string() }).optional(),
    locality: looseObject({ name: string() }).optional(),
    neighborhood: looseObject({ name: string() }).optional(),
    address: looseObject({
      name: string(),
      address_number: string().optional(),
      street_name: string().optional(),
    }).optional(),
  }).optional(),
});

const locationSuggestSchema = looseObject({
  suggestions: array(suggestionSchema),
});

type AddressDetails = {
  streetAddress: string;
  locality: string;
  region: string;
  postalCode: string;
  country: string;
};

type Suggestion = {
  value: string;
  mapboxId: string;
  name: string;
  context?: {
    country?: { name: string };
    region?: { name: string; region_code: string };
    postcode?: { name: string };
    place?: { name: string };
    locality?: { name: string };
    neighborhood?: { name: string };
    address?: {
      name: string;
      address_number?: string;
      street_name?: string;
    };
  };
};

export type AddressAutocompleteProps = {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onAddressSelect?: (address: AddressDetails) => void;
  error?: string;
};

export function AddressAutocomplete({
  onAddressSelect,
  value = '',
  onChange,
  label,
  placeholder,
  error,
}: AddressAutocompleteProps) {
  const sessionToken = useMemo(() => window.crypto.randomUUID(), []);
  const timeoutRef = useRef<number>(-1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [userLocation, setUserLocation] = useState<{
    lng: number;
    lat: number;
  } | null>(null);

  const trpc = useTRPC();
  const { data: env } = useQuery(trpc.common.getClientEnv.queryOptions());

  // Get user's geolocation for proximity-based search
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lng: position.coords.longitude,
            lat: position.coords.latitude,
          });
        },
        () => {
          // Silently fail if user denies geolocation
        },
      );
    }
  }, []);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const fetchAddresses = async (searchQuery: string) => {
    if (!env?.MAPBOX_SEARCHBOX_TOKEN || searchQuery.trim().length === 0) {
      setLoading(false);
      setData([]);
      setSuggestions([]);
      return;
    }

    // Cancel previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    // Build proximity parameter if user location is available
    const proximityParam = userLocation
      ? `&proximity=${userLocation.lng},${userLocation.lat}`
      : '';

    try {
      const res = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(searchQuery)}&limit=5&language=en&types=address,street,place${proximityParam}&session_token=${sessionToken}&access_token=${env.MAPBOX_SEARCHBOX_TOKEN}`,
        { signal: abortControllerRef.current.signal },
      );

      if (!res.ok) {
        let errorMessage = `Failed to fetch address suggestions (${res.status})`;
        try {
          const errorBody = await res.text();
          if (errorBody && errorBody.length < 200) {
            errorMessage = `${errorMessage}: ${errorBody}`;
          } else if (res.statusText) {
            errorMessage = `${errorMessage}: ${res.statusText}`;
          }
        } catch {
          // If reading error body fails, use status text
          if (res.statusText) {
            errorMessage = `${errorMessage}: ${res.statusText}`;
          }
        }

        showFailure({
          title: 'Address Search Error',
          message: errorMessage,
        });

        setLoading(false);
        setData([]);
        setSuggestions([]);
        return;
      }

      const responseData = locationSuggestSchema.parse(await res.json());

      const newSuggestions = responseData.suggestions.map((r) => ({
        value: r.full_address || r.name,
        mapboxId: r.mapbox_id,
        name: r.name,
        context: r.context,
      }));

      setSuggestions(newSuggestions);
      setData(newSuggestions.map((s) => s.value));
      setLoading(false);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Ignore cancelled requests
      }
      console.error('Error fetching addresses:', err);
      setLoading(false);
      setData([]);
      setSuggestions([]);
    }
  };

  const handleChange = (val: string) => {
    window.clearTimeout(timeoutRef.current);
    onChange?.(val);
    setData([]);

    if (val.trim().length === 0) {
      setLoading(false);
      setSuggestions([]);
    } else {
      setLoading(true);
      timeoutRef.current = window.setTimeout(() => {
        fetchAddresses(val);
      }, 300);
    }
  };

  // Function to retrieve full location details
  const retrieveAddress = async (mapboxId: string) => {
    if (!env?.MAPBOX_SEARCHBOX_TOKEN) return null;

    try {
      const res = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/retrieve/${mapboxId}?session_token=${sessionToken}&access_token=${env.MAPBOX_SEARCHBOX_TOKEN}`,
      );

      if (!res.ok) {
        let errorMessage = `Failed to retrieve address details (${res.status})`;
        try {
          const errorBody = await res.text();
          if (errorBody && errorBody.length < 200) {
            errorMessage = `${errorMessage}: ${errorBody}`;
          } else if (res.statusText) {
            errorMessage = `${errorMessage}: ${res.statusText}`;
          }
        } catch {
          // If reading error body fails, use status text
          if (res.statusText) {
            errorMessage = `${errorMessage}: ${res.statusText}`;
          }
        }

        showFailure({
          title: 'Address Retrieval Error',
          message: errorMessage,
        });

        return null;
      }

      const responseData = await res.json();

      if (responseData.features?.[0]?.properties) {
        const props = responseData.features[0].properties;
        const context = props.context || {};

        // Extract address components
        const addressNumber = context.address?.address_number || '';
        const streetName = context.address?.street_name || props.name || '';
        const streetAddress =
          addressNumber && streetName
            ? `${addressNumber} ${streetName}`
            : streetName;

        return {
          streetAddress: streetAddress || '',
          locality:
            context.place?.name ||
            context.locality?.name ||
            context.neighborhood?.name ||
            '',
          region: context.region?.name || '',
          postalCode: context.postcode?.name || '',
          country: context.country?.name || '',
        };
      }
      return null;
    } catch (err) {
      console.error('Error retrieving address details:', err);
      showFailure({
        title: 'Address Retrieval Error',
        message:
          'An unexpected error occurred while retrieving address details',
      });
      return null;
    }
  };

  return (
    <Autocomplete
      label={label}
      placeholder={placeholder}
      value={value}
      data={data}
      onChange={handleChange}
      filter={({ options }) => options}
      onOptionSubmit={async (optionValue) => {
        // Find the selected suggestion
        const selected = suggestions.find((s) => s.value === optionValue);
        if (selected && onAddressSelect) {
          // Retrieve full address details
          const details = await retrieveAddress(selected.mapboxId);
          if (details) {
            onAddressSelect(details);
          }
        }
      }}
      rightSection={loading ? <Loader size={16} /> : null}
      error={error}
      comboboxProps={{
        position: 'bottom',
        middlewares: { flip: false, shift: false },
      }}
    />
  );
}
