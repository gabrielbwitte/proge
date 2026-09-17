import * as React from "react"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Settings2Icon, CommandIcon, BookPlus, Camera, TextInitial, Video, Globe, ImageIcon } from "lucide-react"
import type { ModuleId } from "@/features/projection/types"

const data: {
  navMain: { title: string; id: ModuleId; icon: React.ReactNode }[];
  navSecondary: { title: string; id: ModuleId; icon: React.ReactNode }[];
} = {
  navMain: [
    {
      title: "Bíblia",
      id: "biblia",
      icon: (
        <BookPlus />
      ),
    },
    {
      title: "Letras",
      id: "letras",
      icon: (
        <TextInitial />
      ),
    },
    {
      title: "Fotos",
      id: "fotos",
      icon: (
        <Camera />
      ),
    },
    {
      title: "Videos",
      id: "videos",
      icon: (
        <Video />
      ),
    },
    {
      title: "Web",
      id: "web",
      icon: (
        <Globe />
      ),
    },
    {
      title: "Fundo",
      id: "fundo",
      icon: (
        <ImageIcon />
      ),
    }
  ],
  navSecondary: [
    {
      title: "Configuração",
      id: "configuracao",
      icon: (
        <Settings2Icon
        />
      ),
    }
  ],
}
export function AppSidebar({
  activeModule,
  onModuleSelect,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  activeModule: ModuleId;
  onModuleSelect: (module: ModuleId) => void;
}) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<a href="#" />}
            >
              <CommandIcon className="size-5!" />
              <span className="text-base font-semibold">Proge</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={data.navMain}
          activeModule={activeModule}
          onModuleSelect={onModuleSelect}
        />
        <NavSecondary
          items={data.navSecondary}
          activeModule={activeModule}
          onModuleSelect={onModuleSelect}
          className="mt-auto"
        />
      </SidebarContent>
    </Sidebar>
  )
}
