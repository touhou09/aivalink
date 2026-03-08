import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Icon,
  SimpleGrid,
  Text,
  useColorModeValue,
  useToast,
  VStack,
  Badge,
  Progress,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
} from "@chakra-ui/react";
import { FiCheck, FiStar, FiZap, FiSettings } from "react-icons/fi";
import { useAuthStore } from "../stores/authStore";

interface PlanInfo {
  tier: string;
  name: string;
  price: number;
  price_display: string;
  features: string[];
  limits: {
    max_personas: number;
    max_documents: number;
    max_messages_per_day: number;
    proactive_enabled: boolean;
  };
}

interface UsageSummary {
  tier: string;
  limits: {
    max_personas: number;
    max_documents: number;
    max_messages_per_day: number;
    proactive_enabled: boolean;
  };
  usage: {
    personas: number;
    documents: number;
    messages_today: number;
  };
  remaining: {
    personas: number;
    documents: number;
    messages_today: number;
  };
}

export default function PricingPage() {
  const { token } = useAuthStore();
  const toast = useToast();

  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [currentTier, setCurrentTier] = useState<string>("free");
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const cardBg = useColorModeValue("white", "gray.700");
  const currentPlanBg = useColorModeValue("brand.50", "brand.900");
  const borderColor = useColorModeValue("gray.200", "gray.600");

  useEffect(() => {
    fetchPlans();
    fetchUsage();
  }, [token]);

  const fetchPlans = async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/v1/billing/plans", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans);
        setCurrentTier(data.current_tier);
      }
    } catch (error) {
      console.error("Failed to fetch plans:", error);
    }
  };

  const fetchUsage = async () => {
    if (!token) return;

    try {
      const response = await fetch("/api/v1/billing/usage", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUsage(data);
      }
    } catch (error) {
      console.error("Failed to fetch usage:", error);
    }
  };

  const handleSubscribe = async (tier: string) => {
    if (!token) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tier,
          success_url: `${window.location.origin}/pricing?success=true`,
          cancel_url: `${window.location.origin}/pricing?canceled=true`,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Redirect to Stripe Checkout
        window.location.href = data.checkout_url;
      } else {
        const error = await response.json();
        throw new Error(error.detail);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start checkout",
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!token) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/billing/portal?return_url=${encodeURIComponent(window.location.href)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const data = await response.json();
        window.location.href = data.portal_url;
      } else {
        const error = await response.json();
        throw new Error(error.detail);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to open portal",
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getPlanIcon = (tier: string) => {
    switch (tier) {
      case "premium":
        return FiStar;
      case "standard":
        return FiZap;
      default:
        return FiCheck;
    }
  };

  const getUsagePercentage = (used: number, max: number) => {
    if (max < 0) return 0; // Unlimited
    return Math.min(100, (used / max) * 100);
  };

  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={8}>
        <VStack spacing={2} textAlign="center">
          <Heading size="xl">Choose Your Plan</Heading>
          <Text color="gray.500" maxW="lg">
            Unlock the full potential of your AI companion with our flexible pricing plans.
          </Text>
        </VStack>

        {/* Current Usage */}
        {usage && (
          <Box w="full" p={6} bg={cardBg} borderRadius="lg" borderWidth={1} borderColor={borderColor}>
            <Heading size="md" mb={4}>
              Current Usage ({usage.tier.charAt(0).toUpperCase() + usage.tier.slice(1)} Plan)
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
              <Stat>
                <StatLabel>Personas</StatLabel>
                <StatNumber>
                  {usage.usage.personas}
                  {usage.limits.max_personas > 0 ? ` / ${usage.limits.max_personas}` : ""}
                </StatNumber>
                {usage.limits.max_personas > 0 && (
                  <Progress
                    value={getUsagePercentage(usage.usage.personas, usage.limits.max_personas)}
                    size="sm"
                    colorScheme={usage.remaining.personas <= 0 ? "red" : "green"}
                    mt={2}
                  />
                )}
                {usage.limits.max_personas < 0 && (
                  <StatHelpText color="green.500">Unlimited</StatHelpText>
                )}
              </Stat>

              <Stat>
                <StatLabel>Documents</StatLabel>
                <StatNumber>
                  {usage.usage.documents}
                  {usage.limits.max_documents > 0 ? ` / ${usage.limits.max_documents}` : ""}
                </StatNumber>
                {usage.limits.max_documents > 0 && (
                  <Progress
                    value={getUsagePercentage(usage.usage.documents, usage.limits.max_documents)}
                    size="sm"
                    colorScheme={usage.remaining.documents <= 0 ? "red" : "green"}
                    mt={2}
                  />
                )}
                {usage.limits.max_documents < 0 && (
                  <StatHelpText color="green.500">Unlimited</StatHelpText>
                )}
              </Stat>

              <Stat>
                <StatLabel>Messages Today</StatLabel>
                <StatNumber>
                  {usage.usage.messages_today}
                  {usage.limits.max_messages_per_day > 0 ? ` / ${usage.limits.max_messages_per_day}` : ""}
                </StatNumber>
                {usage.limits.max_messages_per_day > 0 && (
                  <Progress
                    value={getUsagePercentage(usage.usage.messages_today, usage.limits.max_messages_per_day)}
                    size="sm"
                    colorScheme={usage.remaining.messages_today <= 0 ? "red" : "green"}
                    mt={2}
                  />
                )}
                {usage.limits.max_messages_per_day < 0 && (
                  <StatHelpText color="green.500">Unlimited</StatHelpText>
                )}
              </Stat>
            </SimpleGrid>

            {currentTier !== "free" && (
              <Button
                mt={4}
                size="sm"
                leftIcon={<FiSettings />}
                variant="outline"
                onClick={handleManageSubscription}
                isLoading={isLoading}
              >
                Manage Subscription
              </Button>
            )}
          </Box>
        )}

        {/* Pricing Cards */}
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6} w="full">
          {plans.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            const PlanIcon = getPlanIcon(plan.tier);

            return (
              <Box
                key={plan.tier}
                bg={isCurrent ? currentPlanBg : cardBg}
                borderRadius="lg"
                borderWidth={2}
                borderColor={isCurrent ? "brand.500" : borderColor}
                p={6}
                position="relative"
              >
                {isCurrent && (
                  <Badge
                    position="absolute"
                    top={-3}
                    right={4}
                    colorScheme="brand"
                    px={2}
                    py={1}
                    borderRadius="full"
                  >
                    Current Plan
                  </Badge>
                )}

                {plan.tier === "premium" && (
                  <Badge
                    position="absolute"
                    top={-3}
                    left={4}
                    colorScheme="purple"
                    px={2}
                    py={1}
                    borderRadius="full"
                  >
                    Most Popular
                  </Badge>
                )}

                <VStack spacing={4} align="start">
                  <HStack>
                    <Icon as={PlanIcon} boxSize={6} color="brand.500" />
                    <Heading size="md">{plan.name}</Heading>
                  </HStack>

                  <HStack align="baseline">
                    <Text fontSize="3xl" fontWeight="bold">
                      {plan.price === 0 ? "Free" : `$${plan.price}`}
                    </Text>
                    {plan.price > 0 && (
                      <Text color="gray.500">/month</Text>
                    )}
                  </HStack>

                  <VStack align="start" spacing={2} flex={1}>
                    {plan.features.map((feature, index) => (
                      <HStack key={index}>
                        <Icon as={FiCheck} color="green.500" />
                        <Text fontSize="sm">{feature}</Text>
                      </HStack>
                    ))}
                  </VStack>

                  <Button
                    w="full"
                    colorScheme={isCurrent ? "gray" : "brand"}
                    isDisabled={isCurrent || plan.tier === "free"}
                    onClick={() => handleSubscribe(plan.tier)}
                    isLoading={isLoading}
                  >
                    {isCurrent
                      ? "Current Plan"
                      : plan.tier === "free"
                      ? "Default"
                      : "Upgrade"}
                  </Button>
                </VStack>
              </Box>
            );
          })}
        </SimpleGrid>

        <Text fontSize="sm" color="gray.500" textAlign="center">
          All plans include a 14-day free trial. Cancel anytime.
        </Text>
      </VStack>
    </Container>
  );
}
