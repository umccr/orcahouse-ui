import { useMemo } from 'react';
import { useQuery } from '@apollo/client/react';
import { INTROSPECTION_QUERY, listCollections, type IntrospectionResult } from '@/lib/schema';
import { useIsClient } from './useIsClient';

/**
 * Loads the mart schema once (Apollo caches it) and derives the list of collections.
 * Skipped during SSR: the sign-in session lives in the browser, so only the browser can call the API.
 */
export function useMartSchema() {
  const isClient = useIsClient();
  const { data, loading, error, refetch } = useQuery<IntrospectionResult>(INTROSPECTION_QUERY, {
    skip: !isClient,
  });

  const schema = data?.__schema ?? null;
  const collections = useMemo(() => (schema ? listCollections(schema) : []), [schema]);

  return { schema, collections, loading: isClient && loading, error, refetch };
}
