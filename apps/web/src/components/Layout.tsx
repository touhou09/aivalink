import {
  Box,
  Flex,
  HStack,
  IconButton,
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useColorMode,
  useColorModeValue,
  Avatar,
  Text,
} from "@chakra-ui/react";
import { FiSun, FiMoon, FiUser, FiLogOut, FiBook, FiCreditCard } from "react-icons/fi";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import NotificationBell from "./NotificationBell";

export default function Layout() {
  const { colorMode, toggleColorMode } = useColorMode();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const bg = useColorModeValue("white", "gray.800");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <Flex direction="column" minH="100vh">
      <Box as="header" bg={bg} px={4} shadow="sm">
        <Flex h={16} alignItems="center" justifyContent="space-between">
          <HStack spacing={8}>
            <Text
              as={Link}
              to="/"
              fontSize="xl"
              fontWeight="bold"
              color="brand.500"
            >
              Personalinker
            </Text>
            <Button
              as={Link}
              to="/documents"
              variant="ghost"
              leftIcon={<FiBook />}
              size="sm"
            >
              Knowledge Base
            </Button>
            <Button
              as={Link}
              to="/pricing"
              variant="ghost"
              leftIcon={<FiCreditCard />}
              size="sm"
            >
              Pricing
            </Button>
          </HStack>

          <HStack spacing={4}>
            <NotificationBell />

            <IconButton
              aria-label="Toggle color mode"
              icon={colorMode === "light" ? <FiMoon /> : <FiSun />}
              onClick={toggleColorMode}
              variant="ghost"
            />

            <Menu>
              <MenuButton
                as={Button}
                variant="ghost"
                leftIcon={<Avatar size="sm" name={user?.username} />}
              >
                {user?.username}
              </MenuButton>
              <MenuList>
                <MenuItem icon={<FiUser />}>Profile</MenuItem>
                <MenuItem icon={<FiLogOut />} onClick={handleLogout}>
                  Logout
                </MenuItem>
              </MenuList>
            </Menu>
          </HStack>
        </Flex>
      </Box>

      <Box as="main" flex={1} p={4}>
        <Outlet />
      </Box>
    </Flex>
  );
}
