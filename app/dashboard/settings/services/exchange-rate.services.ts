import {
  CreateExchangeRateInput,
  CurrentExchangeRate,
  ExchangeRate,
} from "@/lib/validations/exchange-rate.schemas";
import { serverFetch } from "@/lib/api-client";

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getExchangeRates(params?: {
  page?: number;
  limit?: number;
}): Promise<{ data: ExchangeRate[]; meta: Meta }> {
  return serverFetch<{ data: ExchangeRate[]; meta: Meta }>(
    "/api/exchange-rates",
    {
      method: "GET",
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
      },
    },
  );
}

export async function createExchangeRate(
  payload: CreateExchangeRateInput,
): Promise<{ message: string; data: ExchangeRate }> {
  return serverFetch<{ message: string; data: ExchangeRate }>(
    "/api/exchange-rates",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getCurrentExchangeRate(): Promise<CurrentExchangeRate> {
  const result = await serverFetch<{ data: CurrentExchangeRate }>(
    "/api/exchange-rates/current",
    {
      method: "GET",
    },
  );

  return result.data;
}
