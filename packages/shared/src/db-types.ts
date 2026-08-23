/**
 * HANDGESCHRIEBEN — regenerieren via `supabase gen types --local`, sobald Docker läuft.
 *
 * Slice 1 Schema für Anchor: profiles, groups, link_guests, trips, trip_participants,
 * trip_date_options, date_availabilities + RPCs (join_trip_via_token, set_availability,
 * set_commitment, lock_trip).
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          push_token: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          push_token?: string | null;
          created_at?: string;
        };
        Update: {
          display_name?: string;
          push_token?: string | null;
        };
      };

      groups: {
        Row: {
          id: string;
          name: string;
          invite_token: string;
          created_by: string | null;
          created_at: string;
          last_activity_at: string;
        };
        Insert: {
          name: string;
          invite_token?: string;
          created_by?: string | null;
          created_at?: string;
          last_activity_at?: string;
        };
        Update: {
          name?: string;
          last_activity_at?: string;
        };
      };

      link_guests: {
        Row: {
          id: string;
          group_id: string;
          display_name: string;
          email: string | null;
          converted_user_id: string | null;
          created_at: string;
        };
        Insert: {
          group_id: string;
          display_name: string;
          email?: string | null;
          converted_user_id?: string | null;
          created_at?: string;
        };
        Update: {
          display_name?: string;
          email?: string | null;
          converted_user_id?: string | null;
        };
      };

      trips: {
        Row: {
          id: string;
          group_id: string;
          title: string;
          status: 'draft' | 'collecting' | 'locked' | 'accommodation' | 'active' | 'done';
          destination: string | null;
          deadline: string;
          share_token: string;
          locked_date_option_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          group_id: string;
          title: string;
          status?: 'draft' | 'collecting' | 'locked' | 'accommodation' | 'active' | 'done';
          destination?: string | null;
          deadline: string;
          share_token?: string;
          locked_date_option_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          title?: string;
          status?: 'draft' | 'collecting' | 'locked' | 'accommodation' | 'active' | 'done';
          destination?: string | null;
          deadline?: string;
          locked_date_option_id?: string | null;
        };
      };

      trip_participants: {
        Row: {
          id: string;
          trip_id: string;
          user_id: string | null;
          link_guest_id: string | null;
          display_name: string;
          is_committed: boolean;
          created_at: string;
        };
        Insert: {
          trip_id: string;
          user_id?: string | null;
          link_guest_id?: string | null;
          display_name: string;
          is_committed?: boolean;
          created_at?: string;
        };
        Update: {
          display_name?: string;
          is_committed?: boolean;
        };
      };

      trip_date_options: {
        Row: {
          id: string;
          trip_id: string;
          start_date: string; // YYYY-MM-DD
          end_date: string; // YYYY-MM-DD
        };
        Insert: {
          trip_id: string;
          start_date: string;
          end_date: string;
        };
        Update: {
          start_date?: string;
          end_date?: string;
        };
      };

      date_availabilities: {
        Row: {
          id: string;
          trip_id: string;
          date_option_id: string;
          participant_id: string;
          availability: 'yes' | 'maybe' | 'no';
        };
        Insert: {
          trip_id: string;
          date_option_id: string;
          participant_id: string;
          availability: 'yes' | 'maybe' | 'no';
        };
        Update: {
          availability?: 'yes' | 'maybe' | 'no';
        };
      };
    };

    Views: {};

    Functions: {
      join_trip_via_token: {
        Args: {
          p_token: string;
          p_display_name: string;
        };
        Returns: Array<{
          trip_id: string;
          participant_id: string;
        }>;
      };

      set_availability: {
        Args: {
          p_participant_id: string;
          p_date_option_id: string;
          p_availability: 'yes' | 'maybe' | 'no';
        };
        Returns: null;
      };

      set_commitment: {
        Args: {
          p_participant_id: string;
          p_is_committed: boolean;
        };
        Returns: null;
      };

      lock_trip: {
        Args: {
          p_trip_id: string;
          p_date_option_id: string;
        };
        Returns: null;
      };
    };

    Enums: {
      availability: 'yes' | 'maybe' | 'no';
      trip_status: 'draft' | 'collecting' | 'locked' | 'accommodation' | 'active' | 'done';
    };
  };
}
