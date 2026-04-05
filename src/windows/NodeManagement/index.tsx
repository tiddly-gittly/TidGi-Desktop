import { Helmet } from "@dr.pogodin/react-helmet";
import { Box, Typography, CircularProgress, Alert } from "@mui/material";
import { styled } from "@mui/material/styles";
import React, { useEffect, useState, useCallback } from "react";
import type { KnownNodeEntry } from "@memeloop/protocol";
import type { IConnectedPeer } from "@services/memeloopNode/interface";
import { NodeCard } from "./NodeCard";
import { PinPairingDialog } from "./PinPairingDialog";
import { RevokeDialog } from "./RevokeDialog";

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

const Section = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(4),
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  fontWeight: 600,
  color: theme.palette.text.primary,
}));

const NodeGrid = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))",
  gap: theme.spacing(2),
}));

interface NodeWithStatus extends IConnectedPeer {
  isTrusted: boolean;
  knownEntry?: KnownNodeEntry;
}

export default function NodeManagement(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectedPeers, setConnectedPeers] = useState<IConnectedPeer[]>([]);
  const [knownNodes, setKnownNodes] = useState<KnownNodeEntry[]>([]);
  const [localPinCode, setLocalPinCode] = useState<string>("");

  const [pairingDialogOpen, setPairingDialogOpen] = useState(false);
  const [pairingNodeId, setPairingNodeId] = useState<string | null>(null);

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeNodeId, setRevokeNodeId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [peers, known, pinCode] = await Promise.all([
        window.service.memeloopNode.getConnectedPeers(),
        window.service.memeloopNode.getKnownNodes(),
        window.service.memeloopNode.getLocalPinCode(),
      ]);

      setConnectedPeers(peers);
      setKnownNodes(known);
      setLocalPinCode(pinCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load node data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();

    const interval = setInterval(() => {
      void loadData();
    }, 5000);

    return () => clearInterval(interval);
  }, [loadData]);

  const handlePairNode = useCallback((nodeId: string) => {
    setPairingNodeId(nodeId);
    setPairingDialogOpen(true);
  }, []);

  const handlePairingConfirm = useCallback(
    async (confirmCode: string) => {
      if (!pairingNodeId) return;

      try {
        const result = await window.service.memeloopNode.confirmPeerPin(
          pairingNodeId,
          confirmCode,
        );
        if (result.ok) {
          setPairingDialogOpen(false);
          setPairingNodeId(null);
          await loadData();
        } else {
          throw new Error(result.error ?? "PIN confirmation failed");
        }
      } catch (err) {
        throw err;
      }
    },
    [pairingNodeId, loadData],
  );

  const handleRevokeNode = useCallback((nodeId: string) => {
    setRevokeNodeId(nodeId);
    setRevokeDialogOpen(true);
  }, []);

  const handleRevokeConfirm = useCallback(async () => {
    if (!revokeNodeId) return;

    try {
      await window.service.memeloopNode.removeKnownNode(revokeNodeId);
      setRevokeDialogOpen(false);
      setRevokeNodeId(null);
      await loadData();
    } catch (err) {
      throw err;
    }
  }, [revokeNodeId, loadData]);

  const nodesWithStatus: NodeWithStatus[] = connectedPeers.map((peer) => {
    const knownEntry = knownNodes.find((k) => k.nodeId === peer.nodeId);
    return {
      ...peer,
      isTrusted: Boolean(knownEntry),
      knownEntry,
    };
  });

  const trustedNodes = nodesWithStatus.filter((n) => n.isTrusted);
  const untrustedNodes = nodesWithStatus.filter((n) => !n.isTrusted);

  return (
    <Container>
      <Helmet>
        <title>Node Management</title>
      </Helmet>

      <Header>
        <Typography variant="h5" component="h1">
          Node Management
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Manage discovered and connected nodes. Your PIN code:{" "}
          <strong>{localPinCode || "Loading..."}</strong>
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

        {!loading && !error && (
          <>
            {untrustedNodes.length > 0 && (
              <Section>
                <SectionTitle variant="h6">
                  Discovered Nodes ({untrustedNodes.length})
                </SectionTitle>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  These nodes are discovered but not yet trusted. Pair them
                  using PIN confirmation.
                </Typography>
                <NodeGrid>
                  {untrustedNodes.map((node) => (
                    <NodeCard
                      key={node.nodeId}
                      node={node}
                      onPair={handlePairNode}
                      onRevoke={undefined}
                    />
                  ))}
                </NodeGrid>
              </Section>
            )}

            {trustedNodes.length > 0 && (
              <Section>
                <SectionTitle variant="h6">
                  Trusted Nodes ({trustedNodes.length})
                </SectionTitle>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  These nodes are trusted and can access your resources.
                </Typography>
                <NodeGrid>
                  {trustedNodes.map((node) => (
                    <NodeCard
                      key={node.nodeId}
                      node={node}
                      onPair={undefined}
                      onRevoke={handleRevokeNode}
                    />
                  ))}
                </NodeGrid>
              </Section>
            )}

            {nodesWithStatus.length === 0 && (
              <Box sx={{ textAlign: "center", py: 8 }}>
                <Typography variant="h6" color="text.secondary">
                  No nodes discovered
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  Make sure mDNS discovery is enabled and other nodes are
                  running on your network.
                </Typography>
              </Box>
            )}
          </>
        )}
      </Content>

      <PinPairingDialog
        open={pairingDialogOpen}
        nodeId={pairingNodeId ?? ""}
        localPinCode={localPinCode}
        onConfirm={handlePairingConfirm}
        onCancel={() => {
          setPairingDialogOpen(false);
          setPairingNodeId(null);
        }}
      />

      <RevokeDialog
        open={revokeDialogOpen}
        nodeId={revokeNodeId ?? ""}
        onConfirm={handleRevokeConfirm}
        onCancel={() => {
          setRevokeDialogOpen(false);
          setRevokeNodeId(null);
        }}
      />
    </Container>
  );
}
