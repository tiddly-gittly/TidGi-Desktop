import { Helmet } from "@dr.pogodin/react-helmet";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Card,
  CardContent,
  LinearProgress,
  Chip,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";

const Container = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  backgroundColor: theme.palette.background.default,
  overflow: "hidden",
}));

const Header = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
}));

const Content = styled(Box)(({ theme }) => ({
  flex: 1,
  overflow: "auto",
  padding: theme.spacing(3),
}));

const StatusCard = styled(Card)(({ theme }) => ({
  marginBottom: theme.spacing(3),
}));

const UsageBar = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2),
  marginBottom: theme.spacing(1),
}));

const StatsRow = styled(Box)({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
});

interface SubscriptionData {
  plan: "free" | "pro" | "enterprise";
  status: "active" | "expired" | "cancelled";
  tokenUsed: number;
  tokenTotal: number;
  renewalDate?: string;
  billingHistory: Array<{
    id: string;
    date: string;
    amount: number;
    status: "paid" | "pending" | "failed";
  }>;
}

export default function Subscription(): React.JSX.Element {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(
    null,
  );

  const loadSubscriptionData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await window.service.memeloopNode.getSubscriptionStatus();
      setSubscription(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load subscription data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscriptionData();
  }, [loadSubscriptionData]);

  const handleOpenBilling = useCallback(async () => {
    try {
      await window.service.memeloopNode.openBillingPage();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to open billing page",
      );
    }
  }, []);

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case "pro":
        return "primary";
      case "enterprise":
        return "secondary";
      default:
        return "default";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "success";
      case "expired":
        return "error";
      case "cancelled":
        return "warning";
      default:
        return "default";
    }
  };

  const usagePercentage = subscription
    ? (subscription.tokenUsed / subscription.tokenTotal) * 100
    : 0;

  return (
    <Container>
      <Helmet>
        <title>{t("Subscription.Title")}</title>
      </Helmet>

      <Header>
        <Typography variant="h5" component="h1">
          {t("Subscription.Title")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t("Subscription.Description")}
        </Typography>
      </Header>

      <Content>
        {loading && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
            }}
          >
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && subscription && (
          <>
            <StatusCard>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <Typography variant="h6">{t("Subscription.CurrentPlan")}</Typography>
                  <Chip
                    label={subscription.plan.toUpperCase()}
                    color={getPlanColor(subscription.plan)}
                    size="small"
                  />
                </Box>

                <StatsRow>
                  <Typography variant="body2" color="text.secondary">
                    {t("Subscription.Status")}
                  </Typography>
                  <Chip
                    label={subscription.status.toUpperCase()}
                    color={getStatusColor(subscription.status)}
                    size="small"
                  />
                </StatsRow>

                {subscription.renewalDate && (
                  <StatsRow>
                    <Typography variant="body2" color="text.secondary">
                      {t("Subscription.RenewalDate")}
                    </Typography>
                    <Typography variant="body2">
                      {format(
                        new Date(subscription.renewalDate),
                        "MMM dd, yyyy",
                      )}
                    </Typography>
                  </StatsRow>
                )}

                <Box sx={{ mt: 3 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    fullWidth
                    onClick={handleOpenBilling}
                  >
                    {t("Subscription.ManageBilling")}
                  </Button>
                </Box>
              </CardContent>
            </StatusCard>

            <StatusCard>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  {t("Subscription.TokenUsage")}
                </Typography>

                <StatsRow>
                  <Typography variant="body2" color="text.secondary">
                    {t("Subscription.Used")}
                  </Typography>
                  <Typography variant="body2">
                    {subscription.tokenUsed.toLocaleString()} /{" "}
                    {subscription.tokenTotal.toLocaleString()}
                  </Typography>
                </StatsRow>

                <UsageBar>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(usagePercentage, 100)}
                    color={
                      usagePercentage > 90
                        ? "error"
                        : usagePercentage > 70
                          ? "warning"
                          : "primary"
                    }
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </UsageBar>

                <Typography variant="caption" color="text.secondary">
                  {usagePercentage.toFixed(1)}% used
                </Typography>
              </CardContent>
            </StatusCard>

            {subscription.billingHistory.length > 0 && (
              <StatusCard>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    {t("Subscription.BillingHistory")}
                  </Typography>

                  {subscription.billingHistory.map((invoice) => (
                    <Box
                      key={invoice.id}
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        py: 1.5,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        "&:last-child": { borderBottom: "none" },
                      }}
                    >
                      <Box>
                        <Typography variant="body2">
                          {format(new Date(invoice.date), "MMM dd, yyyy")}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Invoice #{invoice.id}
                        </Typography>
                      </Box>
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 2 }}
                      >
                        <Typography variant="body2" fontWeight={600}>
                          ${invoice.amount.toFixed(2)}
                        </Typography>
                        <Chip
                          label={invoice.status.toUpperCase()}
                          color={
                            invoice.status === "paid"
                              ? "success"
                              : invoice.status === "failed"
                                ? "error"
                                : "warning"
                          }
                          size="small"
                        />
                      </Box>
                    </Box>
                  ))}
                </CardContent>
              </StatusCard>
            )}
          </>
        )}

        {!loading && !error && !subscription && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              {t("Subscription.NoData")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t("Subscription.NoDataDescription")}
            </Typography>
          </Box>
        )}
      </Content>
    </Container>
  );
}
