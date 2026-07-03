-- Crear tabla de perfiles (opcional si usas auth.users de Supabase, pero útil para datos extra)
CREATE TABLE public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text not null,
  full_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar Row Level Security para profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden ver su propio perfil" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Los usuarios pueden actualizar su propio perfil" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Trigger para crear perfil automáticamente al registrarse (Opcional pero recomendado)
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ language plpgsql security definer;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- Crear tabla de categorías
CREATE TABLE public.categories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  color text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Los usuarios ven sus propias categorías" ON public.categories FOR ALL USING (auth.uid() = user_id);


-- Crear tabla de transacciones
CREATE TABLE public.transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  date date not null,
  description text not null,
  amount numeric not null,
  type text not null check (type in ('ingreso', 'egreso')),
  category_id uuid references public.categories(id) on delete set null,
  is_shared boolean default false,
  shared_with_id uuid references public.profiles(id) on delete set null,
  raw_data jsonb, -- Guarda la fila original del CSV por si acaso
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Los usuarios ven sus propias transacciones" ON public.transactions 
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = shared_with_id);

CREATE POLICY "Los usuarios pueden insertar sus transacciones" ON public.transactions 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden actualizar sus transacciones" ON public.transactions 
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden eliminar sus transacciones" ON public.transactions 
  FOR DELETE USING (auth.uid() = user_id);
